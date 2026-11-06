package app.noir.launcher

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Over-the-air updates for NOIR.
 *
 * NOIR reads a small manifest (noir-update.json) published with each GitHub release:
 *   { "versionCode": 4, "versionName": "0.4.0", "apkUrl": "...", "sha256": "...", "notes": "..." }
 * If it is newer than the installed build, the user can install it from NOIR. The APK's SHA-256
 * is checked before installing, and Android itself only accepts it if it is signed with the same
 * key as the installed NOIR. Android always asks the user to confirm the install.
 */
object Updater {
    data class Release(val versionCode: Int, val versionName: String, val apkUrl: String, val sha256: String, val notes: String)

    @Volatile var state = "idle" // idle | disabled | checking | current | available | downloading | installing | installed | error
    @Volatile var latest: Release? = null
    @Volatile var progress = 0
    @Volatile var error: String? = null
    @Volatile var lastCheck = 0L

    fun status(): JSONObject = JSONObject()
        .put("state", if (BuildConfig.UPDATE_URL.isEmpty()) "disabled" else state)
        .put("currentVersion", BuildConfig.VERSION_NAME)
        .put("currentCode", BuildConfig.VERSION_CODE)
        .put("latestVersion", latest?.versionName ?: JSONObject.NULL)
        .put("notes", latest?.notes ?: JSONObject.NULL)
        .put("progress", progress)
        .put("error", error ?: JSONObject.NULL)

    /** Check for a newer release on a background thread. Cheap; safe to call often. */
    fun check(force: Boolean = false) {
        if (BuildConfig.UPDATE_URL.isEmpty()) return
        if (state == "checking" || state == "downloading" || state == "installing") return
        if (!force && System.currentTimeMillis() - lastCheck < 6 * 60 * 60 * 1000L) return
        state = "checking"; error = null
        Thread {
            try {
                val json = JSONObject(httpText(BuildConfig.UPDATE_URL))
                val r = Release(
                    json.getInt("versionCode"), json.getString("versionName"), json.getString("apkUrl"),
                    json.getString("sha256").lowercase(), json.optString("notes", ""),
                )
                latest = r
                state = if (r.versionCode > BuildConfig.VERSION_CODE) "available" else "current"
                lastCheck = System.currentTimeMillis()
            } catch (e: Exception) {
                state = "error"; error = "Couldn't check for updates: ${e.message}"
            }
        }.start()
    }

    /** Download, verify and hand the APK to Android's installer (which asks the user to confirm). */
    fun install(ctx: Context) {
        val r = latest ?: return
        if (state != "available" && state != "error") return
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            error = "Allow NOIR to install updates: Settings → Apps → Security & restrictions → Unknown sources → NOIR. Then try again."
            state = "error"
            try {
                ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) { /* not available on some TV builds; the message explains the manual path */ }
            return
        }
        state = "downloading"; progress = 0; error = null
        Thread {
            try {
                val file = File(ctx.cacheDir, "noir-update.apk")
                download(r.apkUrl, file)
                if (sha256(file) != r.sha256) throw IllegalStateException("The download didn't match the published checksum.")
                state = "installing"
                val installer = ctx.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply { setAppPackageName(ctx.packageName) }
                val id = installer.createSession(params)
                installer.openSession(id).use { session ->
                    session.openWrite("noir.apk", 0, file.length()).use { out -> file.inputStream().use { it.copyTo(out) }; session.fsync(out) }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                    val pi = PendingIntent.getBroadcast(ctx, id, Intent(ctx, UpdateReceiver::class.java), flags)
                    session.commit(pi.intentSender)
                }
            } catch (e: Exception) {
                state = "error"; error = "Update failed: ${e.message}"
            }
        }.start()
    }

    private fun open(url: String): HttpURLConnection {
        var u = URL(url)
        repeat(5) { // follow GitHub's redirects (github.com → release asset host)
            val c = (u.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false; connectTimeout = 15000; readTimeout = 30000
                setRequestProperty("User-Agent", "NOIR-launcher")
            }
            if (c.responseCode in 300..399) { u = URL(u, c.getHeaderField("Location")); c.disconnect() } else return c
        }
        throw IllegalStateException("Too many redirects")
    }

    private fun httpText(url: String): String = open(url).let { c ->
        if (c.responseCode != 200) throw IllegalStateException("HTTP ${c.responseCode}")
        c.inputStream.bufferedReader().use { it.readText() }
    }

    private fun download(url: String, dest: File) {
        val c = open(url)
        if (c.responseCode != 200) throw IllegalStateException("HTTP ${c.responseCode}")
        val total = c.contentLengthLong
        var done = 0L
        c.inputStream.use { input ->
            dest.outputStream().use { out ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf); if (n < 0) break
                    out.write(buf, 0, n); done += n
                    if (total > 0) progress = ((done * 100) / total).toInt()
                }
            }
        }
    }

    private fun sha256(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { input -> val buf = ByteArray(64 * 1024); while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}

/** Receives the installer's result; shows Android's confirmation screen when it asks for one. */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { context.startActivity(it) }
            }
            PackageInstaller.STATUS_SUCCESS -> Updater.state = "installed"
            else -> {
                Updater.state = "error"
                Updater.error = "Update not installed: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "cancelled")
            }
        }
    }
}

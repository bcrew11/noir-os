package app.noir.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.text.InputType
import android.util.Base64
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * NOIR as an Android TV / Google TV launcher.
 *
 * By default the NOIR dashboard is bundled inside the APK and runs self-contained: no NOIR server
 * or computer is needed. Apps installed from Google Play are opened natively through the
 * window.NoirAndroid bridge, which always checks the package manager first so NOIR never claims to
 * open an app that isn't installed. (Optionally, hold BACK to point NOIR at a NOIR server instead.)
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("noir", MODE_PRIVATE) }
    private val bannerCache = HashMap<String, String?>()

    private val bundledUrl = "https://appassets.androidplatform.net/assets/web/index.html"
    private fun serverUrl(): String? = prefs.getString("server", null)?.takeIf { it.isNotBlank() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val assets = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0912"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Rasterize content slightly ahead of time so moving between rows doesn't wait on paint.
            settings.offscreenPreRaster = true
            // Keep NOIR's renderer at high priority while it's on screen.
            if (android.os.Build.VERSION.SDK_INT >= 26) setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
            isFocusable = true
            isFocusableInTouchMode = true
            addJavascriptInterface(Bridge(), "NoirAndroid")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(req.url)
                override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                    val url = serverUrl()
                    if (req.isForMainFrame && url != null) view.loadData(offlinePage(url), "text/html", "utf-8")
                }
            }
        }
        setContentView(web)
        NoirBus.attach(this)
        startPhoneServer()
        Updater.check()
        acceptGoveeKey(intent)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        load()
    }

    private fun load() = web.loadUrl(serverUrl() ?: bundledUrl)

    private fun askServer() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(serverUrl() ?: "")
            hint = "Leave empty to run NOIR on this device"
        }
        AlertDialog.Builder(this)
            .setTitle("NOIR server (optional)")
            .setMessage("NOIR runs on this device by default. Only enter a NOIR server address if you run one, e.g. http://192.168.1.20:8787/")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                var url = input.text.toString().trim()
                if (url.isNotEmpty() && !url.endsWith("/")) url += "/"
                prefs.edit().putString("server", url).apply()
                load()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onDestroy() {
        phoneServer?.stop()
        phoneServer = null
        NoirBus.detach(this)
        super.onDestroy()
    }

    /* ----------------------------- phone app hosting ----------------------------- */

    private var phoneServer: PhoneServer? = null
    private var phonePort = 0

    /** Hosts the NOIR phone app on the LAN (self-contained mode only). API calls are answered by the page. */
    private fun startPhoneServer() {
        if (serverUrl() != null) return
        for (port in listOf(8787, 8788, 8789)) {
            try {
                val srv = PhoneServer(port, { name -> try { assets.open("phone/$name") } catch (e: Exception) { null } }, object : PhoneServer.Relay {
                    override fun request(id: String, method: String, path: String, authorization: String?, body: String?, remote: String) {
                        val args = listOf(id, method, path, authorization ?: "", body ?: "", remote).joinToString(",") { JSONObject.quote(it) }
                        runJs("window.__noirPhoneRequest ? window.__noirPhoneRequest($args) : NoirAndroid.phoneRespond(${JSONObject.quote(id)}, 503, '{\"message\":\"NOIR is starting\"}')")
                    }
                    override fun socket(event: String, clientId: String, data: String?) {
                        runJs("window.__noirPhoneSocket && window.__noirPhoneSocket(${JSONObject.quote(event)}, ${JSONObject.quote(clientId)}, ${JSONObject.quote(data ?: "")})")
                    }
                })
                srv.startServing()
                phoneServer = srv
                phonePort = port
                return
            } catch (e: Exception) { /* port busy: try the next */ }
        }
    }

    /** The stick's LAN IPv4 address (Wi-Fi or Ethernet). */
    private fun lanAddress(): String? {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val props = cm.getLinkProperties(cm.activeNetwork) ?: return null
        return props.linkAddresses.map { it.address }.firstOrNull { it is java.net.Inet4Address && !it.isLoopbackAddress }?.hostAddress
    }

    fun runJs(js: String) = runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(js, null) }

    override fun onResume() {
        super.onResume()
        Updater.check() // at most every 6 hours
    }

    /**
     * Lets the Govee key be set from a computer instead of typing it with the remote:
     *   adb shell am start -n app.noir.launcher/.MainActivity --es govee_key <KEY>
     */
    private fun acceptGoveeKey(intent: Intent?) {
        val k = intent?.getStringExtra("govee_key") ?: return
        Govee.setKey(this, k)
        intent.removeExtra("govee_key")
        web.post { web.evaluateJavascript("window.dispatchEvent(new Event('noir-smart-home'))", null) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.hasExtra("govee_key")) { acceptGoveeKey(intent); return }
        // HOME pressed while NOIR is the launcher: go to NOIR's own Home screen.
        web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Home'}))", null)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Long-press BACK opens the (optional) server dialog; BACK never exits the launcher.
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                if (event.repeatCount == 0) event.startTracking()
                if (event.isLongPress) { askServer(); return true }
            }
            if (event.action == KeyEvent.ACTION_UP && !event.isCanceled && (event.flags and KeyEvent.FLAG_CANCELED_LONG_PRESS) == 0) {
                web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))", null)
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    inner class Bridge {
        /** "android-tv" = self-contained (bundled) mode; "android-tv-server" = using a NOIR server. */
        @JavascriptInterface
        fun platform(): String = if (serverUrl() == null) "android-tv" else "android-tv-server"

        /** First installed, launchable package among the candidates, else an installed app with the same name. */
        @JavascriptInterface
        fun findApp(candidatesJson: String, label: String): String? {
            val candidates = JSONArray(candidatesJson)
            for (i in 0 until candidates.length()) {
                val pkg = candidates.getString(i)
                if (launchIntent(pkg) != null) return pkg
            }
            return installed().firstOrNull { it.second.equals(label, ignoreCase = true) }?.first
        }

        @JavascriptInterface
        fun launch(pkg: String): String {
            val intent = launchIntent(pkg) ?: return JSONObject(mapOf("ok" to false, "message" to "Not installed on this device")).toString()
            runOnUiThread { startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            return JSONObject(mapOf("ok" to true, "message" to "Opened")).toString()
        }

        @JavascriptInterface
        fun installedApps(): String = JSONArray(installed().map { JSONArray(listOf(it.first, it.second)) }).toString()

        /** The app's own TV banner (or icon) as a PNG data URL — the same artwork the system launcher shows. */
        @JavascriptInterface
        fun appBanner(pkg: String): String? = bannerCache.getOrPut(pkg) {
            try {
                val info = packageManager.getApplicationInfo(pkg, 0)
                val d = packageManager.getApplicationBanner(info) ?: return@getOrPut null
                toDataUrl(d, 320, 180)
            } catch (e: Exception) { null }
        }

        @JavascriptInterface
        fun openStore(pkg: String): Boolean {
            val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return try { runOnUiThread { startActivity(market) }; true } catch (e: Exception) { false }
        }

        /** Sends a media key to whichever app currently owns media playback. */
        @JavascriptInterface
        fun mediaKey(key: String) {
            val code = when (key) {
                "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
                "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
                else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            }
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val t = SystemClock.uptimeMillis()
            am.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_DOWN, code, 0))
            am.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_UP, code, 0))
        }

        /** What's playing, from the active media session. Needs notification access (see MediaListener). */
        @JavascriptInterface
        fun nowPlaying(): String = NowPlayingReader.read(this@MainActivity)

        @JavascriptInterface
        fun openNotificationAccess(): Boolean = try {
            runOnUiThread { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            true
        } catch (e: Exception) { false }

        /** True when NOIR is the selected system screensaver. */
        /** URL phones should open, e.g. http://192.168.4.130:8787/phone/ (null if not hosting). */
        @JavascriptInterface
        fun phoneUrl(): String? = if (phoneServer == null) null else lanAddress()?.let { "http://$it:$phonePort/phone/" }

        @JavascriptInterface
        fun phoneRespond(id: String, status: Int, body: String) { phoneServer?.complete(id, status, body) }

        @JavascriptInterface
        fun phoneSend(clientId: String, text: String) { phoneServer?.send(clientId, text) }

        @JavascriptInterface
        fun phoneClose(clientId: String) { phoneServer?.close(clientId) }

        @JavascriptInterface
        fun isScreensaver(): Boolean {
            val flat = Settings.Secure.getString(contentResolver, "screensaver_components") ?: return false
            return flat.split(',').any { ComponentName.unflattenFromString(it)?.className == NoirDream::class.java.name }
        }

        @JavascriptInterface
        fun openScreensaverSettings(): Boolean = try {
            runOnUiThread { startActivity(Intent(Settings.ACTION_DREAM_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }; true
        } catch (e: Exception) { false }

        @JavascriptInterface
        fun keyServiceEnabled(): Boolean = NoirKeyService.isEnabled(this@MainActivity)

        @JavascriptInterface
        fun openAccessibilitySettings(): Boolean = try {
            runOnUiThread { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }; true
        } catch (e: Exception) { false }

        /** Async: the next non-navigation button press arrives via window.__noirNative(callbackId, keyCode, name). */
        @JavascriptInterface
        fun learnKey(callbackId: String) {
            NoirKeyService.learn = { code, name ->
                web.evaluateJavascript("window.__noirNative && window.__noirNative(${JSONObject.quote(callbackId)}, $code, ${JSONObject.quote(name)})", null)
            }
        }

        @JavascriptInterface
        fun cancelLearnKey() { NoirKeyService.learn = null }

        @JavascriptInterface
        fun keyMappings(): String = NoirKeyService.mappings(this@MainActivity).toString()

        @JavascriptInterface
        fun setKeyMapping(keyCode: Int, actionJson: String?): Boolean {
            if (keyCode in NoirKeyService.PROTECTED) return false
            NoirKeyService.setMapping(this@MainActivity, keyCode, actionJson)
            return true
        }

        @JavascriptInterface
        fun goveeHasKey(): Boolean = Govee.hasKey(this@MainActivity)

        @JavascriptInterface
        fun goveeSetKey(key: String) = Govee.setKey(this@MainActivity, key)

        /** Async: result arrives via window.__noirNative(callbackId, status, body). */
        @JavascriptInterface
        fun goveeRequest(callbackId: String, method: String, path: String, body: String?) {
            Govee.request(this@MainActivity, method, path, body) { status, text ->
                val js = "window.__noirNative && window.__noirNative(${JSONObject.quote(callbackId)}, $status, ${JSONObject.quote(text)})"
                runOnUiThread { web.evaluateJavascript(js, null) }
            }
        }

        @JavascriptInterface
        fun updateStatus(): String = Updater.status().toString()

        @JavascriptInterface
        fun checkForUpdate() = Updater.check(force = true)

        @JavascriptInterface
        fun installUpdate() = Updater.install(this@MainActivity)

        @JavascriptInterface
        fun openSystemSettings() {
            runOnUiThread { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
    }

    private fun toDataUrl(d: Drawable, maxW: Int, maxH: Int): String = Images.toDataUrl(d, maxW, maxH)

    private fun launchIntent(pkg: String): Intent? =
        packageManager.getLeanbackLaunchIntentForPackage(pkg) ?: packageManager.getLaunchIntentForPackage(pkg)

    private var installedCache: Pair<Long, List<Pair<String, String>>>? = null

    /** Launchable apps, cached briefly: querying the package manager is slow on streaming sticks. */
    private fun installed(): List<Pair<String, String>> {
        installedCache?.let { (at, list) -> if (SystemClock.elapsedRealtime() - at < 15_000) return list }
        return scanInstalled().also { installedCache = SystemClock.elapsedRealtime() to it }
    }

    private fun scanInstalled(): List<Pair<String, String>> {
        val pm = packageManager
        val out = LinkedHashMap<String, String>()
        for (cat in listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)) {
            val q = Intent(Intent.ACTION_MAIN).addCategory(cat)
            for (ri in pm.queryIntentActivities(q, PackageManager.MATCH_ALL)) {
                val p = ri.activityInfo.packageName
                if (p != packageName) out.putIfAbsent(p, ri.loadLabel(pm).toString())
            }
        }
        return out.toList()
    }

    private fun offlinePage(url: String) = """
        <html><body style="background:#0B0912;color:#F8F7FC;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;max-width:70%"><h1 style="font-weight:500;letter-spacing:.4em">NOIR</h1>
        <p style="color:#A9A3BA;font-size:22px">Can't reach the NOIR server at $url.<br>Retrying…<br><br>Hold BACK and clear the address to run NOIR on this device instead.</p></div>
        <script>setTimeout(function(){location.href='$url'},5000)</script></body></html>
    """.trimIndent()
}

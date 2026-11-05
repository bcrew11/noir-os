package app.noir.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.app.AlertDialog
import org.json.JSONArray
import org.json.JSONObject

/**
 * NOIR as an Android TV / Google TV launcher.
 *
 * A full-screen WebView shows the NOIR dashboard served by your NOIR server. A small
 * JavaScript bridge (window.NoirAndroid) lets the dashboard open *installed* apps natively.
 * Every launch is checked against the package manager first, so NOIR never claims to have
 * opened an app that isn't installed.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("noir", MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0912"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            isFocusable = true
            isFocusableInTouchMode = true
            addJavascriptInterface(Bridge(), "NoirAndroid")
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                    if (req.isForMainFrame) view.loadData(offlinePage(serverUrl()), "text/html", "utf-8")
                }
            }
        }
        setContentView(web)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        if (prefs.getString("server", null) == null) askServer() else load()
    }

    private fun serverUrl() = prefs.getString("server", null) ?: getString(R.string.default_server)
    private fun load() = web.loadUrl(serverUrl())

    private fun askServer() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(serverUrl())
        }
        AlertDialog.Builder(this)
            .setTitle("NOIR server address")
            .setMessage("The address of the computer running the NOIR server, e.g. http://192.168.1.20:8787/")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                var url = input.text.toString().trim()
                if (!url.endsWith("/")) url += "/"
                prefs.edit().putString("server", url).apply()
                load()
            }
            .show()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Pressing HOME while NOIR is the launcher: return to NOIR's own home screen.
        web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Home'}))", null)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Long-press BACK opens server settings; normal BACK goes to NOIR (never exits the launcher).
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_DOWN && event.isLongPress) { askServer(); return true }
            if (event.action == KeyEvent.ACTION_UP && !event.isCanceled) {
                web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))", null)
            }
            if (event.action == KeyEvent.ACTION_DOWN) event.startTracking()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @Deprecated("Launcher: Back never leaves NOIR")
    override fun onBackPressed() { /* handled in dispatchKeyEvent */ }

    inner class Bridge {
        /** Returns the first installed, launchable package among the candidates (or matching the label), else null. */
        @JavascriptInterface
        fun findApp(candidatesJson: String, label: String): String? {
            val pm = packageManager
            val candidates = JSONArray(candidatesJson)
            for (i in 0 until candidates.length()) {
                val pkg = candidates.getString(i)
                if (launchIntent(pkg) != null) return pkg
            }
            return installed().firstOrNull { it.second.equals(label, ignoreCase = true) }?.first
        }

        /** Launches a package. Returns JSON {ok, message}. */
        @JavascriptInterface
        fun launch(pkg: String): String {
            val intent = launchIntent(pkg) ?: return JSONObject(mapOf("ok" to false, "message" to "Not installed on this device")).toString()
            runOnUiThread { startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            return JSONObject(mapOf("ok" to true, "message" to "Opened")).toString()
        }

        /** JSON array of [package, label] for launchable apps. */
        @JavascriptInterface
        fun installedApps(): String = JSONArray(installed().map { JSONArray(listOf(it.first, it.second)) }).toString()

        @JavascriptInterface
        fun platform(): String = "android-tv"
    }

    private fun launchIntent(pkg: String): Intent? =
        packageManager.getLeanbackLaunchIntentForPackage(pkg) ?: packageManager.getLaunchIntentForPackage(pkg)

    private fun installed(): List<Pair<String, String>> {
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
        <p style="color:#A9A3BA;font-size:22px">Can't reach the NOIR server at $url.<br>Make sure it's running. Retrying…<br><br>Hold BACK to change the address.</p></div>
        <script>setTimeout(function(){location.href='$url'},5000)</script></body></html>
    """.trimIndent()
}

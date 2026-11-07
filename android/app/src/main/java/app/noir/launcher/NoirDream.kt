package app.noir.launcher

import android.annotation.SuppressLint
import android.graphics.Color
import android.service.dreams.DreamService
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * NOIR as the system screensaver (Android "daydream"). Shows NOIR's ambient themes — same
 * settings as the in-app Ambient screen, since both share the bundled page's storage. Any remote
 * button wakes the device (non-interactive dream), returning to whatever was on screen.
 */
class NoirDream : DreamService() {
    private var web: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        val assets = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0912"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(DreamBridge(), "NoirAndroid")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = NowPlayingReader.intercept(req.url) ?: assets.shouldInterceptRequest(req.url)
            }
            loadUrl("https://appassets.androidplatform.net/assets/web/index.html?dream=1")
        }
        setContentView(web)
    }

    override fun onDetachedFromWindow() {
        web?.destroy()
        web = null
        super.onDetachedFromWindow()
    }

    /** Read-only subset of the launcher bridge: enough for the clock, theme and now playing. */
    inner class DreamBridge {
        @JavascriptInterface fun platform(): String = "android-tv"
        @JavascriptInterface fun nowPlaying(): String = NowPlayingReader.read(this@NoirDream)
        @JavascriptInterface fun installedApps(): String = "[]"
        @JavascriptInterface fun findApp(candidatesJson: String, label: String): String? = null
        @JavascriptInterface fun appBanner(pkg: String): String? = null
        @JavascriptInterface fun launch(pkg: String): String = """{"ok":false,"message":"Not available in the screensaver"}"""
        @JavascriptInterface fun openStore(pkg: String): Boolean = false
        @JavascriptInterface fun mediaKey(key: String) = Unit
        @JavascriptInterface fun openNotificationAccess(): Boolean = false
        @JavascriptInterface fun openSystemSettings() = Unit
    }
}

package app.noir.launcher

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Govee developer API (https://developer.govee.com) for smart-light control.
 *
 * The API key lives only in NOIR's private app storage and is attached here, natively; the web UI
 * can ask whether a key exists but can never read it back. Requests are limited to Govee's
 * /router/api/v1/ endpoints.
 */
object Govee {
    private const val HOST = "https://openapi.api.govee.com"
    private const val PREFS = "noir-smart-home"

    fun hasKey(ctx: Context) = !key(ctx).isNullOrBlank()
    private fun key(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("govee_key", null)

    fun setKey(ctx: Context, value: String?) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
            if (value.isNullOrBlank()) remove("govee_key") else putString("govee_key", value.trim())
        }.apply()
    }

    /** Performs the request on a background thread and reports (status, body) via [done]. */
    fun request(ctx: Context, method: String, path: String, body: String?, done: (Int, String) -> Unit) {
        val apiKey = key(ctx)
        if (apiKey.isNullOrBlank()) return done(401, """{"message":"No Govee API key set"}""")
        if (!path.startsWith("/router/api/v1/") || (method != "GET" && method != "POST")) return done(400, """{"message":"Unsupported request"}""")
        Thread {
            try {
                val c = (URL(HOST + path).openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 10000; readTimeout = 15000
                    setRequestProperty("Govee-API-Key", apiKey)
                    setRequestProperty("Content-Type", "application/json")
                    if (method == "POST" && body != null) { doOutput = true; outputStream.use { it.write(body.toByteArray()) } }
                }
                val status = c.responseCode
                val text = (if (status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
                done(status, text)
            } catch (e: Exception) {
                done(0, JSONObject().put("message", e.message ?: "Network error").toString())
            }
        }.start()
    }
}

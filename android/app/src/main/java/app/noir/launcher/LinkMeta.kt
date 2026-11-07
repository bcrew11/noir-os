package app.noir.launcher

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Reads a page's title and preview image (Open Graph tags) for the Watch Later list. */
object LinkMeta {
    private val ytId = Regex("""(?:youtu\.be/|[?&]v=|/shorts/|/live/|/embed/)([\w-]{6,})""")

    fun fetch(url: String): JSONObject {
        val u = URL(url)
        if (u.protocol != "https" && u.protocol != "http") throw IllegalArgumentException("Not a web link")
        // YouTube: the official oEmbed endpoint is reliable and tiny.
        if (u.host.contains("youtube") || u.host.contains("youtu.be")) {
            val id = ytId.find(url)?.groupValues?.get(1)
            val o = JSONObject(get("https://www.youtube.com/oembed?format=json&url=" + java.net.URLEncoder.encode(url, "UTF-8"), 64 * 1024).second)
            return JSONObject().put("title", o.optString("title")).put("author", o.optString("author_name"))
                .put("image", if (id != null) "https://i.ytimg.com/vi/$id/hqdefault.jpg" else o.optString("thumbnail_url"))
        }
        val (finalUrl, html) = get(url, 768 * 1024)
        fun meta(vararg names: String): String? {
            for (n in names) {
                val re = Regex("""<meta[^>]+(?:property|name)=["']${Regex.escape(n)}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${Regex.escape(n)}["']""", RegexOption.IGNORE_CASE)
                val m = re.find(html) ?: continue
                return (m.groupValues[1].ifEmpty { m.groupValues[2] }).let(::unescape)
            }
            return null
        }
        val title = meta("og:title", "twitter:title") ?: Regex("<title[^>]*>([^<]+)</title>", RegexOption.IGNORE_CASE).find(html)?.groupValues?.get(1)?.let(::unescape)
        val image = meta("og:image", "og:image:url", "twitter:image")?.let { URL(URL(finalUrl), it).toString() }
        return JSONObject().put("title", title?.trim() ?: "").put("image", image ?: JSONObject.NULL).put("url", finalUrl)
    }

    private fun get(url: String, max: Int): Pair<String, String> {
        var u = URL(url)
        repeat(6) {
            val c = (u.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false; connectTimeout = 10000; readTimeout = 15000
                // A desktop browser UA: many streaming sites only include preview tags for browsers.
                setRequestProperty("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
                setRequestProperty("Accept-Language", "en-US,en;q=0.9")
            }
            if (c.responseCode in 300..399) { u = URL(u, c.getHeaderField("Location")); c.disconnect(); return@repeat }
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            val bytes = c.inputStream.use { ins ->
                val buf = java.io.ByteArrayOutputStream(); val b = ByteArray(16 * 1024)
                while (buf.size() < max) { val n = ins.read(b); if (n < 0) break; buf.write(b, 0, n) }
                buf.toByteArray()
            }
            return u.toString() to String(bytes, Charsets.UTF_8)
        }
        throw IllegalStateException("Too many redirects")
    }

    private fun unescape(s: String) = s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'").replace("&lt;", "<").replace("&gt;", ">")
}

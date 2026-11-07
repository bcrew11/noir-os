package app.noir.launcher

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.WebResourceResponse
import android.media.MediaMetadata
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.SystemClock
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/** Reads the active media session (shared by the launcher and the screensaver). */
object NowPlayingReader {
    /** The current cover, encoded once and served at https://appassets.androidplatform.net/art/<id>.jpg. */
    private class Art(val key: String, val id: String, val bytes: ByteArray)
    @Volatile private var art: Art? = null
    private var artSeq = 0

    /** Cover bytes for a served id (the page and the phone server both read through this). */
    fun artBytes(id: String): ByteArray? = art?.takeIf { it.id == id }?.bytes

    /** WebView hook: answers /art/<id>.jpg on the bundled-assets origin. */
    fun intercept(url: Uri): WebResourceResponse? {
        if (url.host != "appassets.androidplatform.net" || url.path?.startsWith("/art/") != true) return null
        val id = url.lastPathSegment?.removeSuffix(".jpg") ?: ""
        val bytes = artBytes(id) ?: return WebResourceResponse("text/plain", null, 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
        return WebResourceResponse("image/jpeg", null, 200, "OK", mapOf("Cache-Control" to "max-age=86400"), ByteArrayInputStream(bytes))
    }

    /**
     * Apps often publish a new title a moment before its cover, and may send a small placeholder
     * first, so the cover is keyed by the bitmap itself (size + a sample pixel), not the title.
     */
    private fun artUrl(pkg: String, title: String?, bmp: Bitmap?, meta: MediaMetadata): String? {
        if (bmp == null) {
            // Some apps only give a web address for the cover.
            val uri = meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI) ?: meta.getString(MediaMetadata.METADATA_KEY_ART_URI)
            return uri?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
        }
        val sample = try { bmp.getPixel(bmp.width / 2, bmp.height / 3) } catch (_: Exception) { 0 }
        val key = "$pkg|$title|${bmp.width}x${bmp.height}|$sample"
        val cur = art
        if (cur?.key == key) return "https://appassets.androidplatform.net/art/${cur.id}.jpg"
        val scale = minOf(1f, 1024f / maxOf(bmp.width, bmp.height))
        val src = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
        val bytes = ByteArrayOutputStream().also { src.compress(Bitmap.CompressFormat.JPEG, 92, it) }.toByteArray()
        val id = "${System.currentTimeMillis().toString(36)}${artSeq++}"
        art = Art(key, id, bytes)
        return "https://appassets.androidplatform.net/art/$id.jpg"
    }

    fun read(ctx: Context): String {
            val out = JSONObject()
            val msm = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
            val sessions = try {
                msm.getActiveSessions(ComponentName(ctx, MediaListener::class.java))
            } catch (e: SecurityException) {
                return out.put("permission", false).put("active", false).toString()
            }
            out.put("permission", true)
            val c = sessions.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: sessions.firstOrNull()
            val meta = c?.metadata
            if (c == null || meta == null) return out.put("active", false).toString()
            val title = meta.getString(MediaMetadata.METADATA_KEY_TITLE)
            val st = c.playbackState
            var pos = st?.position ?: 0L
            if (st != null && st.state == PlaybackState.STATE_PLAYING && st.lastPositionUpdateTime > 0) {
                pos += ((SystemClock.elapsedRealtime() - st.lastPositionUpdateTime) * st.playbackSpeed).toLong()
            }
            val appLabel = try { ctx.packageManager.getApplicationLabel(ctx.packageManager.getApplicationInfo(c.packageName, 0)).toString() } catch (e: Exception) { c.packageName }
            val bmp = meta.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART) ?: meta.getBitmap(MediaMetadata.METADATA_KEY_ART)
            val artUrl = try { artUrl(c.packageName, title, bmp, meta) } catch (_: Exception) { null }
            return out.put("active", true)
                .put("playing", st?.state == PlaybackState.STATE_PLAYING)
                .put("title", title ?: "")
                .put("artist", meta.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST) ?: "")
                .put("album", meta.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: "")
                .put("durationMs", meta.getLong(MediaMetadata.METADATA_KEY_DURATION))
                .put("positionMs", pos)
                .put("app", appLabel)
                .put("art", artUrl ?: JSONObject.NULL)
                .toString()
    }
}

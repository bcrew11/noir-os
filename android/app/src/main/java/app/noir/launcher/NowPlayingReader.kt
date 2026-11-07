package app.noir.launcher

import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.BitmapDrawable
import android.media.MediaMetadata
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.SystemClock
import org.json.JSONObject

/** Reads the active media session (shared by the launcher and the screensaver). */
object NowPlayingReader {
    @Volatile private var artCache: Pair<String, String?>? = null

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
            val artKey = "${c.packageName}|$title"
            if (artCache?.first != artKey) {
                val bmp = meta.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART) ?: meta.getBitmap(MediaMetadata.METADATA_KEY_ART)
                artCache = artKey to bmp?.let { Images.toDataUrl(BitmapDrawable(ctx.resources, it), 300, 300) }
            }
            return out.put("active", true)
                .put("playing", st?.state == PlaybackState.STATE_PLAYING)
                .put("title", title ?: "")
                .put("artist", meta.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST) ?: "")
                .put("album", meta.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: "")
                .put("durationMs", meta.getLong(MediaMetadata.METADATA_KEY_DURATION))
                .put("positionMs", pos)
                .put("app", appLabel)
                .put("art", artCache?.second ?: JSONObject.NULL)
                .toString()
    }
}

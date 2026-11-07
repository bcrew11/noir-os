package app.noir.launcher

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.util.Base64
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Low-latency navigation sounds. The page renders each click (Web Audio, offline) and hands it over
 * once as a WAV; key presses then play it through SoundPool, which skips the WebView's audio
 * pipeline and its output delay.
 */
class UiSounds(private val ctx: Context) {
    private val pool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME) // the low-latency output path on most devices
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()
    private val loading = ConcurrentHashMap<Int, String>() // sample id → key
    private val ready = ConcurrentHashMap<String, Int>() // key → sample id

    init {
        pool.setOnLoadCompleteListener { _, sampleId, status ->
            val key = loading.remove(sampleId) ?: return@setOnLoadCompleteListener
            if (status != 0) return@setOnLoadCompleteListener
            ready.put(key, sampleId)?.let { old -> if (old != sampleId) pool.unload(old) }
        }
    }

    /** Replace the clip for `key` (e.g. "move") with a base64 WAV. */
    fun load(key: String, wavBase64: String) {
        if (!key.matches(Regex("[a-z0-9-]{1,24}"))) return
        val file = File(ctx.cacheDir, "ui-sound-$key-${System.nanoTime()}.wav")
        file.writeBytes(Base64.decode(wavBase64, Base64.DEFAULT))
        // Old files for this key are no longer needed once SoundPool has decoded them.
        ctx.cacheDir.listFiles { f -> f.name.startsWith("ui-sound-$key-") && f != file }?.forEach { it.delete() }
        val id = pool.load(file.path, 1)
        loading[id] = key
    }

    /** True if the clip was ready and is now playing. */
    fun play(key: String, volume: Float): Boolean {
        val id = ready[key] ?: return false
        val v = volume.coerceIn(0f, 1f)
        return pool.play(id, v, v, 1, 0, 1f) != 0
    }

    fun release() = pool.release()
}

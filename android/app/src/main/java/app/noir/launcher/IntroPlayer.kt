package app.noir.launcher

import android.app.Activity
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.TextureView
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout

/**
 * NOIR's start-up intro: a pre-rendered 1080p60 video with its sound (res/raw/boot_intro.mp4,
 * made by scripts/render-boot-video.mjs), played natively over the WebView the moment NOIR starts.
 * The hardware video decoder keeps it smooth and sharp on a streaming stick, and picture and sound
 * can't drift apart. Home loads underneath; at ~6.2 s the intro lifts away to reveal it while the
 * sound finishes. Any key skips it. Honors the page's settings, mirrored into SharedPreferences
 * (animation off → no intro; start-up sound off → silent; navigation-sound volume).
 */
class IntroPlayer(private val activity: Activity, private val prefs: SharedPreferences) {
    private var overlay: FrameLayout? = null
    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var leaving = false

    val isShowing get() = overlay != null

    /** Adds the intro on top of [root]. Returns false when the intro is turned off. */
    fun show(root: ViewGroup): Boolean {
        if (prefs.getString("intro.motion", "full") != "full") return false
        val volume = if (prefs.getBoolean("intro.sound", true)) prefs.getFloat("intro.volume", 0.66f).coerceIn(0f, 1f) else 0f
        val frame = FrameLayout(activity).apply { setBackgroundColor(Color.parseColor("#07060C")) }
        val texture = TextureView(activity)
        frame.addView(texture, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(frame, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        overlay = frame
        texture.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) = start(Surface(st), volume)
            override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) {}
            // The view goes away when the intro lifts; keep the sound playing to its end (picture detached).
            override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean { try { player?.setSurface(null) } catch (_: Exception) { }; return true }
            override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
        }
        // Safety net: never leave the intro on screen (e.g. if the video can't be decoded).
        handler.postDelayed({ leave() }, 9000)
        return true
    }

    private fun start(surface: Surface, volume: Float) {
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
                setDataSource(activity, Uri.parse("android.resource://${activity.packageName}/${R.raw.boot_intro}"))
                setSurface(surface)
                setVolume(volume, volume)
                setOnPreparedListener {
                    it.start()
                    handler.postDelayed({ leave() }, 6200) // lift away; the sound's tail keeps playing
                }
                setOnCompletionListener { release() }
                setOnErrorListener { _, _, _ -> leave(); release(); true }
                prepareAsync()
            }
        } catch (_: Exception) { leave() }
    }

    /** Fade + slight zoom away, revealing Home. Called at the end, on a key press, or on error. */
    fun leave(skip: Boolean = false) {
        val v = overlay ?: return
        if (leaving) return
        leaving = true
        if (skip) player?.let { p -> fadeOutAudio(p) }
        v.animate().alpha(0f).scaleX(1.04f).scaleY(1.04f).setDuration(if (skip) 300 else 550)
            .setInterpolator(DecelerateInterpolator())
            .withEndAction {
                (v.parent as? ViewGroup)?.removeView(v)
                overlay = null
                if (skip) release()
            }.start()
    }

    private fun fadeOutAudio(p: MediaPlayer) {
        var vol = prefs.getFloat("intro.volume", 0.66f)
        val step = object : Runnable {
            override fun run() {
                vol *= 0.6f
                try { p.setVolume(vol, vol) } catch (_: Exception) { return }
                if (vol > 0.02f) handler.postDelayed(this, 40) else release()
            }
        }
        handler.post(step)
    }

    fun release() {
        try { player?.release() } catch (_: Exception) { }
        player = null
    }
}

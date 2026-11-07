package app.noir.launcher

import android.content.SharedPreferences
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup

/**
 * NOIR's start-up intro: a pre-rendered 1080p60 video with its sound (res/raw/boot_intro.mp4,
 * made by scripts/render-boot-video.mjs), played natively the moment NOIR starts.
 *
 * - A SurfaceView placed above the window: frames go straight to the display, so playback stays
 *   smooth even while Home is being built underneath (a TextureView would stall with the UI thread).
 * - The video fades itself out to the page's background colour, so its last frame is dark; the view
 *   is then removed and the page fades Home in (MainActivity.introDone) — no freeze, no cut.
 * - Any key skips: the sound fades quickly and Home fades in.
 * Honors the page's settings, mirrored into SharedPreferences (animation off → no intro; start-up
 * sound off → silent; navigation-sound volume).
 */
class IntroPlayer(private val activity: MainActivity, private val prefs: SharedPreferences) {
    private var view: SurfaceView? = null
    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var done = false
    private val safety = Runnable { finish(); release() }

    val isShowing get() = view != null

    /** Adds the intro on top of [root]. Returns false when the intro is turned off. */
    fun show(root: ViewGroup): Boolean {
        if (prefs.getString("intro.motion", "full") != "full") return false
        val volume = if (prefs.getBoolean("intro.sound", true)) prefs.getFloat("intro.volume", 0.66f).coerceIn(0f, 1f) else 0f
        val sv = SurfaceView(activity).apply {
            setZOrderOnTop(true)
            holder.setFormat(PixelFormat.OPAQUE)
        }
        sv.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(h: SurfaceHolder) = start(h, volume)
            override fun surfaceChanged(h: SurfaceHolder, f: Int, w: Int, ht: Int) {}
            override fun surfaceDestroyed(h: SurfaceHolder) { try { player?.setDisplay(null) } catch (_: Exception) { } }
        })
        root.addView(sv, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        view = sv
        // Safety net: never leave the intro on screen (e.g. if the video can't be decoded).
        handler.postDelayed(safety, 9000)
        return true
    }

    private fun start(holder: SurfaceHolder, volume: Float) {
        if (player != null) return
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
                setDataSource(activity, Uri.parse("android.resource://${activity.packageName}/${R.raw.boot_intro}"))
                setDisplay(holder)
                setVolume(volume, volume)
                setOnPreparedListener { it.start() }
                setOnCompletionListener { finish(); release() }
                setOnErrorListener { _, _, _ -> finish(); release(); true }
                prepareAsync()
            }
        } catch (_: Exception) { finish() }
    }

    /** End of the intro (or skip/error): remove the video (its last frame is already dark) and fade Home in. */
    private fun finish() {
        if (done) return
        done = true
        handler.removeCallbacks(safety)
        view?.let { (it.parent as? ViewGroup)?.removeView(it) }
        view = null
        activity.introDone()
    }

    /** A key press during the intro. */
    fun skip() {
        if (done) return
        player?.let { fadeOutAudio(it) }
        finish()
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

package app.noir.launcher

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Process

/**
 * Full restart of NOIR. Runs in its own process (":restart"), so it can end the main process and
 * then start NOIR fresh: everything is reloaded and the start-up intro plays, as at power-on.
 */
class RestartActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mainPid = intent.getIntExtra(EXTRA_PID, -1)
        if (mainPid > 0) Process.killProcess(mainPid)
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        finish()
        Runtime.getRuntime().exit(0) // this helper process isn't needed any more
    }

    companion object {
        const val EXTRA_PID = "pid"

        /** Called from the main process. */
        fun restart(from: Activity) {
            from.startActivity(Intent(from, RestartActivity::class.java)
                .putExtra(EXTRA_PID, Process.myPid())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION))
        }
    }
}

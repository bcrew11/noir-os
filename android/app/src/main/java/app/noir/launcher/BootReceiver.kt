package app.noir.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Opens NOIR after the device boots (in addition to being selectable as the HOME app). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

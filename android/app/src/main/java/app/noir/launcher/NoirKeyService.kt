package app.noir.launcher

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import org.json.JSONObject

/**
 * Remote button remapping.
 *
 * An accessibility service is the only way Android lets an app see remote buttons that the system
 * would otherwise act on itself (e.g. the onn remote's app-shortcut buttons), including while another
 * app is in front. The user has to enable it; NOIR only reacts to buttons the user has assigned and
 * never records anything else.
 *
 * Mappings are stored as  key_<keyCode> -> action JSON:
 *   {"type":"govee_toggle","device":"..","sku":"..","name":".."}
 *   {"type":"launch","pkg":"com.example","name":"Example"}
 *   {"type":"noir_home"}
 */
class NoirKeyService : AccessibilityService() {
    companion object {
        private const val PREFS = "noir-remote-buttons"
        /** Navigation keys can never be remapped, so the remote can't be made unusable. */
        val PROTECTED = setOf(
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_HOME,
            KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_VOLUME_MUTE, KeyEvent.KEYCODE_POWER,
        )

        /** Set while NOIR's "Assign a button" dialog is waiting for a press. */
        @Volatile var learn: ((keyCode: Int, name: String) -> Unit)? = null

        fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        fun mappings(ctx: Context): JSONObject {
            val out = JSONObject()
            for ((k, v) in prefs(ctx).all) if (k.startsWith("key_") && v is String) {
                val code = k.removePrefix("key_").toInt()
                out.put(k.removePrefix("key_"), JSONObject(v).put("keyName", keyName(code)))
            }
            return out
        }

        fun setMapping(ctx: Context, keyCode: Int, action: String?) {
            if (keyCode in PROTECTED) return
            prefs(ctx).edit().apply { if (action.isNullOrBlank()) remove("key_$keyCode") else putString("key_$keyCode", action) }.apply()
        }

        fun keyName(code: Int): String = KeyEvent.keyCodeToString(code).removePrefix("KEYCODE_").replace('_', ' ').lowercase()
            .replaceFirstChar { it.uppercase() }

        fun isEnabled(ctx: Context): Boolean {
            val flat = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            val me = ComponentName(ctx, NoirKeyService::class.java)
            return flat.split(':').any { ComponentName.unflattenFromString(it) == me }
        }
    }

    private val main = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        serviceInfo = serviceInfo.apply { flags = flags or AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS }
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        val code = event.keyCode
        learn?.let { cb ->
            if (code in PROTECTED) return false // let navigation work while the dialog is open
            if (event.action == KeyEvent.ACTION_UP) { learn = null; main.post { cb(code, keyName(code)) } }
            return true
        }
        val action = prefs(this).getString("key_$code", null) ?: return false
        if (event.action == KeyEvent.ACTION_UP && event.repeatCount == 0) main.post { perform(JSONObject(action)) }
        return true // swallow both down and up so the system shortcut doesn't also fire
    }

    private fun perform(a: JSONObject) {
        when (a.optString("type")) {
            "govee_toggle" -> toggleLight(a.getString("device"), a.getString("sku"), a.optString("name", "Light"))
            "launch" -> {
                val pkg = a.getString("pkg")
                val i = packageManager.getLeanbackLaunchIntentForPackage(pkg) ?: packageManager.getLaunchIntentForPackage(pkg)
                if (i != null) startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) else toast("${a.optString("name", pkg)} isn't installed")
            }
            "noir_home" -> startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        }
    }

    private fun toast(msg: String) { main.post { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() } }

    /** Read the light's state, send the opposite, then read back to confirm (Govee may ack without acting). */
    private fun toggleLight(device: String, sku: String, name: String) {
        val stateBody = { JSONObject().put("requestId", System.nanoTime().toString()).put("payload", JSONObject().put("sku", sku).put("device", device)).toString() }
        fun power(text: String): Int? = try {
            val caps = JSONObject(text).getJSONObject("payload").getJSONArray("capabilities")
            (0 until caps.length()).map { caps.getJSONObject(it) }.firstOrNull { it.optString("instance") == "powerSwitch" }
                ?.optJSONObject("state")?.opt("value")?.toString()?.toIntOrNull()
        } catch (e: Exception) { null }
        Govee.request(this, "POST", "/router/api/v1/device/state", stateBody()) { s1, t1 ->
            if (s1 !in 200..299) return@request toast("$name: couldn't reach Govee")
            val want = if (power(t1) == 1) 0 else 1
            val control = JSONObject().put("requestId", System.nanoTime().toString()).put("payload", JSONObject().put("sku", sku).put("device", device)
                .put("capability", JSONObject().put("type", "devices.capabilities.on_off").put("instance", "powerSwitch").put("value", want))).toString()
            Govee.request(this, "POST", "/router/api/v1/device/control", control) { s2, _ ->
                if (s2 !in 200..299) return@request toast("$name: Govee refused the command")
                main.postDelayed({
                    Govee.request(this, "POST", "/router/api/v1/device/state", stateBody()) { _, t3 ->
                        val confirmed = power(t3) == want
                        toast(if (confirmed) "$name ${if (want == 1) "on" else "off"}" else "$name: sent, not confirmed yet")
                        // Keep NOIR's Home light button in sync (null = state unknown).
                        NoirBus.emit("noir-light", JSONObject().put("device", device).put("on", if (confirmed) want == 1 else JSONObject.NULL))
                    }
                }, 900)
            }
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit
}

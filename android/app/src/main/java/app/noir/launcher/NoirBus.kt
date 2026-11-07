package app.noir.launcher

import org.json.JSONObject
import java.lang.ref.WeakReference

/** Lets background components (e.g. the remote-button service) notify the NOIR UI if it's running. */
object NoirBus {
    @Volatile private var activity: WeakReference<MainActivity>? = null

    fun attach(a: MainActivity) { activity = WeakReference(a) }
    fun detach(a: MainActivity) { if (activity?.get() === a) activity = null }

    /** Dispatches a DOM CustomEvent(name, { detail }) in the NOIR page. */
    fun emit(name: String, detail: JSONObject) {
        val a = activity?.get() ?: return
        a.runJs("window.dispatchEvent(new CustomEvent(${JSONObject.quote(name)}, { detail: $detail }))")
    }
}

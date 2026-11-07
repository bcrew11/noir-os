package app.noir.launcher

import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoWSD
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * LAN server for the NOIR phone app, hosted by the stick itself (no computer needed).
 *
 *  - GET /phone/…  → the phone web app (bundled in the APK); iPhone: Share → Add to Home Screen
 *  - /api/…        → relayed to the NOIR page, which owns state, pairing and permissions
 *  - /ws           → WebSocket, relayed both ways (remote presses in, state snapshots out)
 *
 * This class makes no access decisions itself: every API request and socket message goes to the
 * page, which checks the phone's pairing token. Kept free of Android APIs so it can be unit-tested.
 */
class PhoneServer(
    port: Int,
    private val openAsset: (String) -> InputStream?,
    private val relay: Relay,
) : NanoWSD(port) {

    interface Relay {
        /** Forward an API request; answer later with [complete]. */
        fun request(id: String, method: String, path: String, authorization: String?, body: String?, remote: String)
        /** Socket events: "open" | "message" | "close". */
        fun socket(event: String, clientId: String, data: String?)
    }

    private val pending = ConcurrentHashMap<String, CompletableFuture<Pair<Int, String>>>()
    private val sockets = ConcurrentHashMap<String, Socket>()

    fun complete(id: String, status: Int, body: String) {
        pending.remove(id)?.complete(status to body)
    }

    fun send(clientId: String, text: String) {
        try { sockets[clientId]?.send(text) } catch (_: IOException) { /* closed */ }
    }

    fun close(clientId: String) {
        try { sockets[clientId]?.close(WebSocketFrame.CloseCode.PolicyViolation, "unauthorized", false) } catch (_: IOException) { }
    }

    override fun serveHttp(session: IHTTPSession): Response {
        val uri = session.uri
        return when {
            uri == "/" || uri == "/phone" -> redirect("/phone/")
            uri.startsWith("/phone/") -> serveAsset(uri.removePrefix("/phone/"))
            uri.startsWith("/api/") -> relayApi(session)
            else -> json(404, """{"message":"Not found"}""")
        }
    }

    private fun relayApi(session: IHTTPSession): Response {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len > 4 * 1024 * 1024) return json(413, """{"message":"Too large"}""")
        val body = if (len > 0) {
            val buf = ByteArray(len)
            var read = 0
            while (read < len) { val n = session.inputStream.read(buf, read, len - read); if (n < 0) break; read += n }
            String(buf, 0, read, Charsets.UTF_8)
        } else null
        val id = UUID.randomUUID().toString()
        val future = CompletableFuture<Pair<Int, String>>()
        pending[id] = future
        val path = session.uri + (session.queryParameterString?.let { "?$it" } ?: "")
        relay.request(id, session.method.name, path, session.headers["authorization"], body, session.remoteIpAddress ?: "")
        return try {
            val (status, text) = future.get(15, TimeUnit.SECONDS)
            json(status, text)
        } catch (e: Exception) {
            pending.remove(id)
            json(504, """{"message":"NOIR didn't answer. Is NOIR open on the TV?"}""")
        }
    }

    private fun serveAsset(rel: String): Response {
        val clean = rel.split('?')[0].ifEmpty { "index.html" }
        if (clean.contains("..")) return json(400, """{"message":"Bad path"}""")
        // Single-page app: unknown paths fall back to index.html.
        var name = clean
        val stream = openAsset(clean) ?: openAsset("index.html").also { name = "index.html" } ?: return json(404, """{"message":"Phone app missing"}""")
        val r = newChunkedResponse(Response.Status.OK, mime(name), stream)
        r.addHeader("Cache-Control", if (name.startsWith("assets/")) "public, max-age=31536000, immutable" else "no-cache")
        return r
    }

    private fun redirect(to: String) = newFixedLengthResponse(Response.Status.TEMPORARY_REDIRECT, "text/plain", "").apply { addHeader("Location", to) }

    private fun json(status: Int, body: String): Response =
        newFixedLengthResponse(Response.Status.lookup(status) ?: Response.Status.INTERNAL_ERROR, "application/json; charset=utf-8", body)

    private fun mime(name: String) = when (name.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html; charset=utf-8"
        "js", "mjs" -> "text/javascript; charset=utf-8"
        "css" -> "text/css; charset=utf-8"
        "json" -> "application/json"
        "webmanifest" -> "application/manifest+json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "woff2" -> "font/woff2"
        "woff" -> "font/woff"
        else -> "application/octet-stream"
    }

    override fun openWebSocket(handshake: IHTTPSession): WebSocket = Socket(handshake)

    inner class Socket(handshake: IHTTPSession) : WebSocket(handshake) {
        private val id = UUID.randomUUID().toString()
        override fun onOpen() { sockets[id] = this; relay.socket("open", id, null) }
        override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) {
            sockets.remove(id); relay.socket("close", id, null)
        }
        override fun onMessage(message: WebSocketFrame) { relay.socket("message", id, message.textPayload) }
        override fun onPong(pong: WebSocketFrame?) = Unit
        override fun onException(exception: IOException?) = Unit
    }

    /** Only upgrade requests to /ws become WebSockets; everything else is plain HTTP. */
    override fun serve(session: IHTTPSession): Response =
        if (session.uri == "/ws") super.serve(session) else serveHttp(session)

    fun startServing() = start(0, false) // no read timeout: WebSockets stay open while idle
}

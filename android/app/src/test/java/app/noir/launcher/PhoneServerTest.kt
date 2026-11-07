package app.noir.launcher

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.DataInputStream
import java.net.HttpURLConnection
import java.net.Socket
import java.net.URL
import java.util.Base64
import java.util.concurrent.LinkedBlockingQueue
import kotlin.random.Random

/** Real HTTP + WebSocket round trips against the phone server, with a fake "page". */
class PhoneServerTest {
    private lateinit var server: PhoneServer
    private val events = LinkedBlockingQueue<String>()
    private val port = 18787

    @Before fun start() {
        server = PhoneServer(port, { name -> if (name == "index.html" || name == "assets/app.js") "content:$name".byteInputStream() else null }, object : PhoneServer.Relay {
            override fun request(id: String, method: String, path: String, authorization: String?, body: String?, remote: String) {
                events.add("req $method $path auth=$authorization body=$body")
                // The page answers asynchronously, like evaluateJavascript would.
                Thread { Thread.sleep(30); server.complete(id, if (authorization == "Bearer good") 200 else 401, """{"path":"$path"}""") }.start()
            }
            override fun socket(event: String, clientId: String, data: String?) {
                events.add("ws $event $data")
                if (event == "message") server.send(clientId, "echo:$data")
            }
        })
        server.startServing()
    }

    @After fun stop() = server.stop()

    private fun call(path: String, method: String = "GET", auth: String? = null, body: String? = null): Pair<Int, String> {
        val c = URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection
        c.instanceFollowRedirects = false
        c.requestMethod = method
        auth?.let { c.setRequestProperty("Authorization", it) }
        if (body != null) { c.doOutput = true; c.outputStream.use { it.write(body.toByteArray()) } }
        val code = c.responseCode
        val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.readText() ?: ""
        return code to text
    }

    @Test fun servesPhoneAppWithSpaFallback() {
        assertEquals("content:index.html", call("/phone/").second)
        assertEquals("content:assets/app.js", call("/phone/assets/app.js").second)
        assertEquals("content:index.html", call("/phone/some/route").second)
        assertEquals(307, call("/").first) // temporary: Safari must not cache it forever
        assertEquals(400, call("/phone/../secret").first)
    }

    @Test fun relaysApiToThePageAndReturnsItsAnswer() {
        assertEquals(200 to """{"path":"/api/state"}""", call("/api/state", auth = "Bearer good"))
        assertEquals(401, call("/api/state", auth = "Bearer bad").first)
        assertEquals(200, call("/api/command", "POST", "Bearer good", """{"type":"music.next"}""").first)
        assertTrue(events.any { it.contains("""body={"type":"music.next"}""") })
    }

    /** Minimal RFC 6455 client: handshake, one masked text frame out, one text frame in. */
    private class MiniWs(port: Int) {
        val s = Socket("127.0.0.1", port).apply { soTimeout = 10000 }
        private val input = DataInputStream(s.getInputStream())
        init {
            val key = Base64.getEncoder().encodeToString(Random.nextBytes(16))
            s.getOutputStream().write("GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\n\r\n".toByteArray())
            val head = StringBuilder()
            while (!head.endsWith("\r\n\r\n")) head.append(input.readByte().toInt().toChar())
            check(head.startsWith("HTTP/1.1 101")) { "handshake failed: $head" }
        }
        fun send(text: String) {
            val data = text.toByteArray(); val mask = Random.nextBytes(4)
            val out = s.getOutputStream()
            out.write(0x81); out.write(0x80 or data.size); out.write(mask)
            out.write(ByteArray(data.size) { (data[it].toInt() xor mask[it % 4].toInt()).toByte() })
        }
        fun receive(): String {
            input.readUnsignedByte(); val len = input.readUnsignedByte() and 0x7f
            return String(ByteArray(len).also { input.readFully(it) })
        }
        fun close() = s.close()
    }

    @Test fun websocketRelaysBothWaysAndSurvivesIdle() {
        val ws = MiniWs(port)
        ws.send("""{"type":"hello"}""")
        assertEquals("""echo:{"type":"hello"}""", ws.receive())
        Thread.sleep(6000) // longer than NanoHTTPD's default 5s read timeout: must stay open
        ws.send("ping")
        assertEquals("echo:ping", ws.receive())
        ws.close()
        Thread.sleep(500)
        assertTrue(events.any { it.startsWith("ws open") })
        assertTrue(events.any { it.startsWith("ws close") })
    }
}

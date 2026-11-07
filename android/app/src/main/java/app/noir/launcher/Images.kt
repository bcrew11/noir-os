package app.noir.launcher

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream

object Images {
    fun toDataUrl(d: Drawable, maxW: Int, maxH: Int): String {
        val w = d.intrinsicWidth.takeIf { it > 0 } ?: maxW
        val h = d.intrinsicHeight.takeIf { it > 0 } ?: maxH
        val scale = minOf(1f, maxW.toFloat() / w, maxH.toFloat() / h)
        val bmp = Bitmap.createBitmap((w * scale).toInt().coerceAtLeast(1), (h * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        d.setBounds(0, 0, canvas.width, canvas.height)
        d.draw(canvas)
        val bytes = ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        return "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

}

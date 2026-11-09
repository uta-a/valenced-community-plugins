package dev.uta.valenced.platformindicators

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.view.View

/** [icons] side by side, each [size] px with [gap] px between them. Shown at the end of the author's name. */
internal class IndicatorDrawable(
    private val icons: List<Drawable>,
    private val size: Int,
    private val gap: Int,
) : Drawable() {
    init {
        setBounds(0, 0, intrinsicWidth, intrinsicHeight)
    }

    override fun getIntrinsicWidth() = if (icons.isEmpty()) 0 else icons.size * size + (icons.size - 1) * gap

    override fun getIntrinsicHeight() = size

    override fun draw(canvas: Canvas) {
        val rtl = layoutDirection == View.LAYOUT_DIRECTION_RTL
        val top = bounds.top + (bounds.height() - size) / 2
        icons.forEachIndexed { i, icon ->
            val offset = i * (size + gap)
            val left = if (rtl) bounds.right - offset - size else bounds.left + offset
            icon.setBounds(left, top, left + size, top + size)
            icon.draw(canvas)
        }
    }

    override fun setAlpha(alpha: Int) {
        for (icon in icons) icon.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) = Unit

    @Deprecated("Deprecated in Java")
    override fun getOpacity() = PixelFormat.TRANSLUCENT
}

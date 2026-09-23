package com.zende.androidtv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

val Canvas = Color(0xFF020711)
val Surface = Color(0xFF0D1524)
val SurfaceRaised = Color(0xFF121C2E)
val Border = Color(0xFF253147)
val Ink = Color(0xFFF5F7FB)
val Muted = Color(0xFF9AA5B8)
val Brand = Color(0xFFFF347F)
val FocusBlue = Color(0xFF4C9FFF)
val Warm = Color(0xFFFF8A00)

private val ZendeColors = darkColorScheme(
    primary = FocusBlue,
    onPrimary = Color(0xFF06101E),
    secondary = Brand,
    onSecondary = Color.White,
    background = Canvas,
    onBackground = Ink,
    surface = Surface,
    onSurface = Ink,
    surfaceVariant = SurfaceRaised,
    onSurfaceVariant = Muted,
    border = Border,
    error = Color(0xFFFF6B72),
)

@Composable
fun ZendeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = ZendeColors, content = content)
}

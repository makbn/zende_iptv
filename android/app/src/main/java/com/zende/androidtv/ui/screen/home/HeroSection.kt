package com.zende.androidtv.ui.screen.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.theme.Canvas
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted

@Composable
fun HeroSection(channel: Channel, continuing: Boolean, onPlay: () -> Unit) {
    Box(Modifier.fillMaxWidth().height(465.dp)) {
        HeroArtwork(channel)
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Canvas, Canvas.copy(alpha = .94f), Canvas.copy(alpha = .18f)))))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Canvas))))
        AnimatedContent(
            targetState = channel.url,
            transitionSpec = { (fadeIn(tween(240)) + slideInVertically(tween(240)) { it / 10 }) togetherWith fadeOut(tween(120)) },
            label = "heroContent",
            modifier = Modifier.align(Alignment.CenterStart),
        ) { _ ->
            val title = remember(channel.displayTitle) { heroTitle(channel.displayTitle) }
            val episodeContext = remember(channel.displayTitle, channel.subtitle) { heroEpisodeContext(channel.displayTitle, channel.subtitle) }
            Column(Modifier.width(680.dp).padding(start = 86.dp, top = 36.dp)) {
                Text(if (continuing) "CONTINUE WATCHING" else "FEATURED ON ZENDE", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp)
                Text(
                    title,
                    color = Ink,
                    fontSize = 46.sp,
                    lineHeight = 52.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 14.dp),
                )
                val meta = episodeContext ?: channel.subtitle.ifEmpty { channel.groupTitle.orEmpty() }
                if (meta.isNotBlank()) Text(meta, color = Muted, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 9.dp))
                Text(channel.description ?: channel.homeMetadata?.overview ?: "Watch live channels, movies, and shows from your Zende library.", color = Muted, fontSize = 16.sp, lineHeight = 23.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 16.dp))
                Row(Modifier.padding(top = 22.dp)) {
                    Button(onClick = onPlay, colors = ButtonDefaults.colors(containerColor = Color.White, contentColor = Color.Black)) { Text(if (continuing) "▶  Resume" else "▶  Play", fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.width(12.dp))
                    OutlinedButton(onClick = {}) { Text("ⓘ  More Info") }
                }
            }
        }
    }
}

@Composable
private fun HeroArtwork(channel: Channel) {
    SubcomposeAsyncImage(
        model = channel.artUrl,
        contentDescription = null,
        modifier = Modifier.fillMaxSize(),
        contentScale = ContentScale.Crop,
        alignment = Alignment.TopEnd,
        loading = {
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Canvas, Color(0xFF0E1A2D), Canvas))))
        },
        error = {
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Canvas, Color(0xFF0B1526), Canvas))))
        },
        success = { SubcomposeAsyncImageContent() },
    )
}

private val trailingEpisode = Regex("\\s*[•·|]\\s*(S\\d{1,2}E\\d{1,2})\\s*$", RegexOption.IGNORE_CASE)

private fun heroTitle(raw: String): String = raw
    .replace(trailingEpisode, "")
    .trim()
    .trimEnd('•', '·', '|', '-')
    .trim()
    .ifBlank { raw }

private fun heroEpisodeContext(raw: String, fallback: String): String? {
    val episodeCode = Regex("\\bS\\d{1,2}E\\d{1,2}\\b", RegexOption.IGNORE_CASE)
    // Providers frequently put the same episode number into both fields (for example
    // `Show · S1E1` and subtitle `S01E01`). Keep the hero quiet and avoid duplicate text.
    if (episodeCode.findAll(raw).count() > 1 || (episodeCode.containsMatchIn(raw) && episodeCode.containsMatchIn(fallback))) return null
    val episode = trailingEpisode.find(raw)?.groupValues?.getOrNull(1)
    return episode?.takeIf(String::isNotBlank) ?: fallback.takeIf(String::isNotBlank)
}

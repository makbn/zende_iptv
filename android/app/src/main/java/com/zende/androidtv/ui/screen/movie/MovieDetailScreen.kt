package com.zende.androidtv.ui.screen.movie

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.zende.androidtv.model.Channel
import com.zende.androidtv.model.MovieInfo
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Brand
import com.zende.androidtv.ui.theme.Canvas
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface

@Composable
fun MovieDetailScreen(
    original: Channel,
    info: MovieInfo?,
    loading: Boolean,
    error: String?,
    favorite: Boolean,
    canDownload: Boolean,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onPlay: (Channel) -> Unit,
    onFavorite: (Channel) -> Unit,
    onShare: (Channel) -> Unit,
    onDownload: (Channel) -> Unit,
) {
    BackHandler(onBack = onBack)
    val movie = info?.channel?.takeIf { it.url.isNotBlank() } ?: original
    val metadata = info?.metadata
    val title = metadata?.title ?: movie.displayTitle
    val poster = metadata?.posterUrl ?: movie.posterUrl
    val backdrop = metadata?.backdropUrl ?: movie.artUrl ?: poster
    val facts = listOfNotNull(metadata?.year, metadata?.contentRating, info?.durationSeconds?.takeIf { it > 0 }?.let { "${it / 60} min" }).joinToString("  •  ")

    Box(Modifier.fillMaxSize().background(Canvas)) {
        if (!backdrop.isNullOrBlank()) AsyncImage(backdrop, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alpha = .5f)
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Canvas, Canvas.copy(alpha = .92f), Canvas.copy(alpha = .25f)))))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Canvas.copy(alpha = .2f), Canvas))))
        Column(Modifier.fillMaxSize().padding(start = 86.dp, end = 86.dp, top = 82.dp, bottom = 42.dp)) {
            Button(onClick = onBack, colors = ButtonDefaults.colors(containerColor = Color(0xB31A2231), contentColor = Ink), contentPadding = PaddingValues(horizontal = 17.dp, vertical = 10.dp)) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Movies", fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(30.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Box(Modifier.width(220.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(14.dp)).background(Surface).border(1.dp, Border, RoundedCornerShape(14.dp))) {
                    AsyncImage(poster, title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                }
                Column(Modifier.padding(start = 34.dp, bottom = 8.dp).width(820.dp)) {
                    Text("MOVIE", color = Brand, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
                    Text(title, color = Ink, fontSize = 48.sp, lineHeight = 51.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 10.dp))
                    if (facts.isNotBlank()) Text(facts, color = Color.White.copy(alpha = .72f), fontSize = 14.sp, modifier = Modifier.padding(top = 13.dp))
                    metadata?.overview?.takeIf(String::isNotBlank)?.let { Text(it, color = Color.White.copy(alpha = .7f), fontSize = 16.sp, lineHeight = 23.sp, maxLines = 5, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 17.dp)) }
                    if (loading) Text("Loading movie details…", color = Muted, modifier = Modifier.padding(top = 18.dp))
                    if (error != null) {
                        Row(Modifier.padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically) { Text(error, color = Color(0xFFFF777D)); Spacer(Modifier.width(14.dp)); Button(onClick = onRetry) { Text("Try again") } }
                    }
                    Row(Modifier.padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                        DetailAction("Play", Icons.Filled.PlayArrow, true) { onPlay(movie) }
                        DetailAction(if (favorite) "Favorited" else "Favorite", Icons.Outlined.StarBorder) { onFavorite(movie) }
                        DetailAction("Share", Icons.Outlined.Share) { onShare(movie) }
                        if (canDownload) DetailAction("Download", Icons.Outlined.Download) { onDownload(movie) }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailAction(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, primary: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.colors(
            containerColor = if (primary) Color.White else Color(0xC21A2231),
            contentColor = if (primary) Color.Black else Color.White,
            focusedContainerColor = if (primary) Color.White else Brand,
            focusedContentColor = Color.Black,
        ),
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 13.dp),
    ) { Icon(icon, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text(label, fontWeight = FontWeight.Bold) }
}

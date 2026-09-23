package com.zende.androidtv.ui.component

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.FocusBlue
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface

@Composable
fun MovieCard(
    channel: Channel,
    poster: Boolean,
    isFavorite: Boolean = false,
    onPlay: () -> Unit,
    onFavorite: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.055f else 1f, label = "cardScale")
    var revealed by remember(channel.url) { mutableStateOf(false) }
    LaunchedEffect(channel.url) { revealed = true }
    val revealAlpha by animateFloatAsState(if (revealed) 1f else 0f, animationSpec = androidx.compose.animation.core.tween(180), label = "cardRevealAlpha")
    val revealScale by animateFloatAsState(if (revealed) 1f else .985f, animationSpec = androidx.compose.animation.core.tween(220), label = "cardRevealScale")
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = modifier.width(if (poster) 174.dp else 258.dp).graphicsLayer(alpha = revealAlpha).scale(scale * revealScale).clip(shape).background(Surface)
            .border(if (focused) 3.dp else 1.dp, if (focused) FocusBlue else Border, shape)
            .onFocusChanged { focused = it.isFocused }.clickable(onClick = onPlay),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(if (poster) 2f / 3f else 16f / 9f).background(Color(0xFF131D30))) {
            AsyncImage(
                model = if (poster) channel.posterUrl else channel.artUrl,
                contentDescription = channel.displayTitle,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color(0xC9000000)))))
            if (focused) {
                Box(Modifier.align(Alignment.Center).size(46.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.PlayArrow, null, tint = Color.Black, modifier = Modifier.size(30.dp))
                }
            }
            if (!poster) Text(channel.displayTitle, modifier = Modifier.align(Alignment.BottomStart).padding(12.dp), color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1)
        }
        if (poster) {
            Column(Modifier.fillMaxWidth().height(70.dp).padding(horizontal = 11.dp, vertical = 10.dp)) {
                Text(channel.displayTitle, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(channel.subtitle.ifEmpty { channel.groupTitle.orEmpty() }, color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 5.dp))
            }
        }
    }
}

@Composable
fun MediaRowTitle(title: String, eyebrow: String? = null) {
    Column {
        eyebrow?.let { Text(it.uppercase(), color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp) }
        Text(title, color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Bold)
    }
}

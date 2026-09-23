package com.zende.androidtv.ui.screen.series

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
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
import com.zende.androidtv.model.SeriesEpisode
import com.zende.androidtv.model.SeriesInfo
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Brand
import com.zende.androidtv.ui.theme.Canvas
import com.zende.androidtv.ui.theme.FocusBlue
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Composable
fun SeriesDetailScreen(
    channel: Channel,
    info: SeriesInfo?,
    loading: Boolean,
    error: String?,
    selectedSeason: String?,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSeason: (String) -> Unit,
    onPlay: (SeriesEpisode) -> Unit,
    favorite: Boolean,
    canDownload: Boolean,
    onFavorite: () -> Unit,
    onShare: () -> Unit,
    onDownload: (SeriesEpisode) -> Unit,
) {
    BackHandler(onBack = onBack)
    val metadata = info?.metadata
    val title = metadata?.title ?: info.text("name") ?: channel.displayTitle
    val overview = metadata?.overview ?: info.text("plot", "description", "overview") ?: channel.description
    val cover = metadata?.posterUrl ?: info.text("cover", "movie_image") ?: channel.posterUrl
    val backdrop = metadata?.backdropUrl ?: info.text("cover_big", "backdrop_path", "backdrop", "movie_image") ?: cover
    val seasons = remember(info?.episodes) { info?.episodes.orEmpty().map { it.season }.distinct().sortedBy { it.toIntOrNull() ?: 0 } }
    val activeSeason = selectedSeason ?: seasons.firstOrNull()
    val episodes = remember(info?.episodes, activeSeason) { info?.episodes.orEmpty().filter { it.season == activeSeason } }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Canvas),
        contentPadding = PaddingValues(bottom = 54.dp),
    ) {
        item {
            Box(Modifier.fillMaxWidth().height(470.dp)) {
                if (!backdrop.isNullOrBlank()) {
                    AsyncImage(backdrop, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alpha = .48f)
                }
                Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Canvas, Canvas.copy(alpha = .9f), Canvas.copy(alpha = .18f)))))
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Canvas.copy(alpha = .15f), Canvas))))
                Column(Modifier.fillMaxSize().padding(start = 86.dp, end = 86.dp, top = 82.dp, bottom = 24.dp)) {
                    Button(
                        onClick = onBack,
                        colors = ButtonDefaults.colors(containerColor = Color(0xB31A2231), contentColor = Ink),
                        contentPadding = PaddingValues(horizontal = 17.dp, vertical = 10.dp),
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Library", fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(24.dp))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Box(Modifier.width(190.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(14.dp)).background(Surface).border(1.dp, Border, RoundedCornerShape(14.dp))) {
                            AsyncImage(cover, title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        }
                        Column(Modifier.padding(start = 28.dp, bottom = 5.dp).width(760.dp)) {
                            Text("TV SHOW", color = Brand, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
                            Text(title, color = Ink, fontSize = 42.sp, lineHeight = 45.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 9.dp))
                            val facts = listOfNotNull(
                                metadata?.year,
                                seasons.takeIf { it.isNotEmpty() }?.let { "${it.size} season${if (it.size == 1) "" else "s"}" },
                                channel.groupTitle,
                            ).joinToString("  •  ")
                            if (facts.isNotBlank()) Text(facts, color = Color.White.copy(alpha = .72f), fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp))
                            if (!overview.isNullOrBlank()) Text(overview, color = Color.White.copy(alpha = .68f), fontSize = 15.sp, lineHeight = 22.sp, maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 15.dp))
                            info?.episodes?.firstOrNull()?.let { first ->
                                Row(Modifier.padding(top = 21.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    SeriesAction("Play ${first.code}", Icons.Filled.PlayArrow, true) { onPlay(first) }
                                    SeriesAction(if (favorite) "Favorited" else "Favorite", Icons.Outlined.StarBorder, onClick = onFavorite)
                                    SeriesAction("Share", Icons.Outlined.Share, onClick = onShare)
                                    if (canDownload) SeriesAction("Download", Icons.Outlined.Download) { onDownload(first) }
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 86.dp), verticalAlignment = Alignment.Bottom) {
                Column {
                    Text("WATCH THE SERIES", color = Brand, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
                    Text("Episodes", color = Ink, fontSize = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
                    Text(
                        if (activeSeason == null) "Choose an episode" else "Season $activeSeason  •  ${episodes.size} episodes",
                        color = Muted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }

        if (loading) {
            item { Text("Loading seasons and episodes…", color = Muted, fontSize = 16.sp, modifier = Modifier.padding(horizontal = 86.dp, vertical = 42.dp)) }
        } else if (error != null) {
            item {
                Row(Modifier.padding(horizontal = 86.dp, vertical = 34.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(error, color = Color(0xFFFF777D), fontSize = 16.sp)
                    Spacer(Modifier.width(18.dp))
                    Button(onClick = onRetry) { Text("Try again", fontWeight = FontWeight.Bold) }
                }
            }
        } else if (seasons.isEmpty()) {
            item { Text("No episodes found.", color = Muted, fontSize = 16.sp, modifier = Modifier.padding(horizontal = 86.dp, vertical = 42.dp)) }
        } else {
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 86.dp, vertical = 19.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(seasons, key = { it }) { season ->
                        SeasonButton(season, season == activeSeason) { onSeason(season) }
                    }
                }
            }
            items(episodes.chunked(2), key = { row -> row.joinToString("|") { it.playUrl } }) { row ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 86.dp, vertical = 7.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    row.forEach { episode ->
                        EpisodeCard(episode, cover, { onPlay(episode) }, Modifier.weight(1f))
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun SeriesAction(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, primary: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.colors(
            containerColor = if (primary) Color.White else Color(0xC21A2231),
            contentColor = if (primary) Color.Black else Color.White,
            focusedContainerColor = if (primary) Color.White else Brand,
            focusedContentColor = Color.Black,
        ),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) { Icon(icon, null, Modifier.size(19.dp)); Spacer(Modifier.width(7.dp)); Text(label, fontWeight = FontWeight.Bold) }
}

@Composable
private fun SeasonButton(season: String, selected: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.colors(
            containerColor = if (selected) FocusBlue else Color(0xFF111927),
            contentColor = Color.White,
            focusedContainerColor = Color.White,
            focusedContentColor = Color.Black,
        ),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
    ) { Text("Season $season", fontSize = 14.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun EpisodeCard(episode: SeriesEpisode, fallbackArt: String?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.025f else 1f, label = "episodeScale")
    val shape = RoundedCornerShape(15.dp)
    Row(
        modifier.scale(scale).height(160.dp).clip(shape).background(Color(0xFF111722))
            .border(if (focused) 3.dp else 1.dp, if (focused) FocusBlue else Border, shape)
            .onFocusChanged { focused = it.isFocused }.clickable(onClick = onClick).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(226.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(10.dp)).background(Surface)) {
            AsyncImage(episode.artworkUrl ?: fallbackArt, episode.title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alpha = if (episode.artworkUrl == null) .62f else 1f)
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xB8000000)))))
            Text(episode.code, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.align(Alignment.BottomStart).padding(9.dp).background(Color(0xB3050810), RoundedCornerShape(5.dp)).padding(horizontal = 7.dp, vertical = 3.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 18.dp)) {
            Text("${episode.episodeNum.ifBlank { "–" }}. ${episode.title}", color = Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(Modifier.padding(top = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                episode.runtimeLabel?.let {
                    Icon(Icons.Outlined.Schedule, null, tint = Muted, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(it, color = Muted, fontSize = 12.sp)
                }
                episode.airDate?.takeIf(String::isNotBlank)?.let { Text("  •  $it", color = Muted, fontSize = 12.sp) }
                episode.rating?.takeIf { it > 0 }?.let { Text("  •  ★ ${"%.1f".format(it)}", color = Muted, fontSize = 12.sp) }
            }
            episode.overview?.takeIf(String::isNotBlank)?.let { Text(it, color = Color.White.copy(alpha = .58f), fontSize = 12.sp, lineHeight = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp)) }
        }
        Box(Modifier.size(46.dp).clip(CircleShape).background(if (focused) Color.White else Color.White.copy(alpha = .12f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.PlayArrow, "Play ${episode.code}", tint = if (focused) Color.Black else Color.White, modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.width(8.dp))
    }
}

private fun SeriesInfo?.text(vararg keys: String): String? {
    val source = this?.info ?: return null
    for (key in keys) {
        when (val value = source[key]) {
            is JsonPrimitive -> value.contentOrNull?.trim()?.takeIf(String::isNotBlank)?.let { return it }
            is JsonArray -> value.firstOrNull()?.let { (it as? JsonPrimitive)?.contentOrNull }?.trim()?.takeIf(String::isNotBlank)?.let { return it }
            else -> Unit
        }
    }
    return null
}

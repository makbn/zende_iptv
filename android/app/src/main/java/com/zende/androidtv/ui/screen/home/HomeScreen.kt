package com.zende.androidtv.ui.screen.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.zende.androidtv.model.Channel
import com.zende.androidtv.model.HomeShelves
import com.zende.androidtv.ui.component.MediaRowTitle
import com.zende.androidtv.ui.theme.Canvas
import com.zende.androidtv.ui.theme.Surface
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

@Composable
fun HomeScreen(home: HomeShelves, history: List<Channel>, favorites: Set<String>, onPlay: (Channel) -> Unit, onFavorite: (Channel) -> Unit, loading: Boolean = false) {
    val continueWatching = history.filter {
        !it.isLive && it.positionSeconds != null && it.positionSeconds > 0 && it.displayTitle.isNotBlank() && it.displayTitle != "Video"
    }
    val continueUrls = continueWatching.mapTo(hashSetOf()) { it.url }
    val trending = interleave(home.series.channels, home.movies.channels).filterNot { it.url in continueUrls }.take(18)
    val popular = home.discover.channels.filterNot { it.url in continueUrls }.take(24)
    val movies = home.movies.channels.filterNot { it.url in continueUrls }.take(18)
    val series = home.series.channels.filterNot { it.url in continueUrls }.take(18)
    val hero = continueWatching.firstOrNull() ?: movies.firstOrNull() ?: popular.firstOrNull()
    if (loading && home.discover.channels.isEmpty() && home.movies.channels.isEmpty() && history.isEmpty()) {
        HomeLoadingState()
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        hero?.let { HeroSection(it, history.isNotEmpty()) { onPlay(it) } }
        if (continueWatching.isNotEmpty()) {
            Column { Box(modifierPadding()) { MediaRowTitle("Continue Watching") }; DiscoveryRow(continueWatching.take(6), false, favorites, onPlay, onFavorite) }
        }
        if (trending.isNotEmpty()) {
            Column { Box(modifierPadding()) { MediaRowTitle("Trending Now") }; DiscoveryRow(trending, false, favorites, onPlay, onFavorite) }
        }
        if (popular.isNotEmpty()) {
            Column { Box(modifierPadding()) { MediaRowTitle("Popular on Zende") }; DiscoveryRow(popular, false, favorites, onPlay, onFavorite) }
        }
        if (movies.isNotEmpty()) {
            Column { Box(modifierPadding()) { MediaRowTitle("Movies for You") }; DiscoveryRow(movies, true, favorites, onPlay, onFavorite) }
        }
        if (series.isNotEmpty()) {
            Column { Box(modifierPadding()) { MediaRowTitle("Series to Explore") }; DiscoveryRow(series, true, favorites, onPlay, onFavorite) }
        }
    }
}

@Composable
private fun HomeLoadingState() {
    val transition = rememberInfiniteTransition(label = "homeLoading")
    val shift = transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1050, easing = LinearEasing), RepeatMode.Reverse), label = "loadingSheen").value
    val shimmer = Brush.linearGradient(listOf(Surface, Color(0xFF1B2940).copy(alpha = .75f + shift * .18f), Surface))
    Column(Modifier.background(Canvas).padding(top = 112.dp)) {
        Box(Modifier.padding(start = 86.dp).width(610.dp).height(20.dp).background(shimmer, RoundedCornerShape(7.dp)))
        Spacer(Modifier.height(18.dp))
        Box(Modifier.padding(start = 86.dp).width(720.dp).height(52.dp).background(shimmer, RoundedCornerShape(10.dp)))
        Spacer(Modifier.height(75.dp))
        repeat(3) {
            Box(Modifier.padding(start = 86.dp).width(240.dp).height(18.dp).background(shimmer, RoundedCornerShape(6.dp)))
            Spacer(Modifier.height(14.dp))
            Row(Modifier.padding(start = 86.dp)) {
                repeat(6) { index ->
                    Box(Modifier.width(174.dp).height(242.dp).background(shimmer, RoundedCornerShape(14.dp)))
                    if (index < 5) Spacer(Modifier.width(14.dp))
                }
            }
            Spacer(Modifier.height(30.dp))
        }
    }
}

private fun interleave(first: List<Channel>, second: List<Channel>): List<Channel> = buildList {
    repeat(maxOf(first.size, second.size)) { index ->
        first.getOrNull(index)?.let(::add)
        second.getOrNull(index)?.let(::add)
    }
}.distinctBy { it.url }

private fun modifierPadding() = Modifier.padding(start = 86.dp, top = 12.dp)

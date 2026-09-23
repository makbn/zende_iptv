package com.zende.androidtv.ui.screen.home

import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRestorer
import androidx.compose.ui.unit.dp
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.component.MovieCard

@Composable
fun DiscoveryRow(channels: List<Channel>, poster: Boolean, favorites: Set<String>, onPlay: (Channel) -> Unit, onFavorite: (Channel) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 86.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.focusGroup().focusRestorer().padding(top = 14.dp, bottom = 20.dp),
    ) {
        items(channels, key = { it.url }) { channel ->
            MovieCard(channel, poster, channel.url in favorites, { onPlay(channel) }, { onFavorite(channel) })
        }
    }
}

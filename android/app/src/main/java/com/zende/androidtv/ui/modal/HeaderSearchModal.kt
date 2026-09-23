package com.zende.androidtv.ui.modal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.component.MovieCard
import com.zende.androidtv.ui.component.SearchComponent

@Composable
fun HeaderSearchModal(results: List<Channel>, favorites: Set<String>, onQuery: (String) -> Unit, onPlay: (Channel) -> Unit, onFavorite: (Channel) -> Unit, onDismiss: () -> Unit) {
    var query by remember { mutableStateOf("") }
    ZendeDialog("Search Zende", "Find any channel, movie, show, country, or language.", onDismiss) {
        SearchComponent(query, "Start typing…", { query = it; onQuery(it) }, Modifier.padding(top = 8.dp))
        LazyRow(contentPadding = PaddingValues(vertical = 18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(results, key = { it.url }) { channel -> MovieCard(channel, !channel.isLive, channel.url in favorites, { onPlay(channel); onDismiss() }, { onFavorite(channel) }) }
        }
    }
}

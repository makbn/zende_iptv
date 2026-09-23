package com.zende.androidtv.ui.screen.favorites

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import androidx.tv.material3.Button
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.component.MovieCard
import com.zende.androidtv.ui.component.SearchComponent
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Warm

@Composable
fun FavoritesScreen(favorites: List<Channel>, onPlay: (Channel) -> Unit, onFavorite: (Channel) -> Unit) {
    var query by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf("Recent") }
    var posterView by remember { mutableStateOf(true) }
    val shown = remember(query, favorites, sort) {
        favorites.filter { query.isBlank() || it.displayTitle.contains(query, true) || it.groupTitle.orEmpty().contains(query, true) }
            .let { rows -> when (sort) { "A–Z" -> rows.sortedBy { it.displayTitle.lowercase() }; "Category" -> rows.sortedBy { it.groupTitle.orEmpty().lowercase() }; else -> rows } }
    }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(24.dp).background(Color(0x80050B15), RoundedCornerShape(16.dp)).border(6.dp, Border, RoundedCornerShape(16.dp)).padding(24.dp)) {
            Text("★  SAVED", color = Warm, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Row(Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) { Text("Favorites", color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Bold); Text("Search, sort, and open saved channels.", color = Muted, fontSize = 13.sp) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatChip("${favorites.size} saved"); StatChip("${favorites.mapNotNull { it.groupTitle }.distinct().size} groups"); StatChip("${shown.size} shown")
                    Button(onClick = {}) { Text("Open TV guide") }
                }
            }
            SearchComponent(query, "Search saved channels…", { query = it }, Modifier.padding(top = 18.dp))
            Row(Modifier.padding(top = 12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.width(370.dp)) { Text("CATEGORY", color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold); androidx.tv.material3.OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth().height(42.dp)) { Text("All categories") } }
                androidx.tv.material3.Button(onClick = { sort = when (sort) { "Recent" -> "A–Z"; "A–Z" -> "Category"; else -> "Recent" } }) { Text(sort) }
                androidx.tv.material3.Button(onClick = { posterView = !posterView }) { Text(if (posterView) "▦ Posters" else "☷ List") }
            }
        }
        Column(Modifier.padding(horizontal = 24.dp, vertical = 14.dp)) { Text("LIBRARY", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text("Your channels", color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Bold); Text("${shown.size} in view", color = Muted, fontSize = 12.sp) }
        LazyVerticalGrid(columns = GridCells.Adaptive(165.dp), contentPadding = PaddingValues(horizontal = 30.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(13.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            items(shown, key = { it.url }) { channel -> MovieCard(channel, poster = posterView, isFavorite = true, onPlay = { onPlay(channel) }, onFavorite = { onFavorite(channel) }) }
        }
    }
}

@Composable private fun StatChip(label: String) {
    Text(label, color = Muted, fontSize = 11.sp, modifier = Modifier.background(Color(0xFF111827), RoundedCornerShape(18.dp)).border(1.dp, Border, RoundedCornerShape(18.dp)).padding(horizontal = 12.dp, vertical = 8.dp))
}

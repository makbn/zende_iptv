package com.zende.androidtv.ui.screen.library

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import com.zende.androidtv.model.CatalogFilters
import com.zende.androidtv.model.CatalogResponse
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.component.MovieCard
import com.zende.androidtv.ui.component.SearchComponent
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface

@Composable
fun LibraryScreen(catalog: CatalogResponse, filters: CatalogFilters, favorites: Set<String>, onFilters: (CatalogFilters) -> Unit, onPlay: (Channel) -> Unit, onFavorite: (Channel) -> Unit) {
    var posterView by remember { mutableStateOf(true) }
    var sort by remember { mutableStateOf("Recent") }
    val shown = remember(catalog.channels, sort) {
        when (sort) {
            "A–Z" -> catalog.channels.sortedBy { it.displayTitle.lowercase() }
            "Category" -> catalog.channels.sortedBy { it.groupTitle.orEmpty().lowercase() }
            else -> catalog.channels
        }
    }
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(24.dp).background(Color(0x8A050B15), RoundedCornerShape(16.dp))
                .border(1.dp, Border, RoundedCornerShape(16.dp)).padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.width(145.dp)) { Text("LIBRARY", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text("Signal deck", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Bold) }
            SearchComponent(filters.query, "Search channels, countries, languages…", { onFilters(filters.copy(query = it)) }, Modifier.weight(1f))
            Metric("SHOWING", catalog.total.toString()); Metric("MODE", filters.type.replaceFirstChar { it.uppercase() }); Metric("FACETS", catalog.facets.categories.size.toString())
            shown.firstOrNull()?.let { first ->
                Column(Modifier.width(265.dp).padding(start = 18.dp)) {
                    Text("FIRST MATCH", color = Muted, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                    Text(first.displayTitle, color = Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(first.groupTitle.orEmpty(), color = Muted, fontSize = 10.sp, maxLines = 1)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).background(Surface, RoundedCornerShape(15.dp)).border(1.dp, Border, RoundedCornerShape(15.dp)).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            listOf("all" to "All", "live" to "Live", "movie" to "Movies", "series" to "Shows").forEach { (type, label) ->
                Button(onClick = { onFilters(filters.copy(type = type)) }, colors = ButtonDefaults.colors(containerColor = if (filters.type == type) Color.White else Color(0xFF080F1C), contentColor = if (filters.type == type) Color.Black else Ink)) { Text(label) }
            }
            FilterStepper("Category", filters.category, catalog.facets.categories.map { it.key }) { onFilters(filters.copy(category = it)) }
            FilterStepper("Language", filters.language, catalog.facets.languages.map { it.key }) { onFilters(filters.copy(language = it)) }
            FilterStepper("Country", filters.country, catalog.facets.countries.map { it.key }) { onFilters(filters.copy(country = it)) }
            FilterStepper("Year", filters.year, catalog.facets.years.map { it.key }) { onFilters(filters.copy(year = it)) }
            Spacer(Modifier.weight(1f))
            Button(onClick = { sort = when (sort) { "Recent" -> "A–Z"; "A–Z" -> "Category"; else -> "Recent" } }) { Text(sort) }
            Button(onClick = { posterView = !posterView }) { Text(if (posterView) "▦ Posters" else "☷ List") }
            Text("⚙ ${catalog.total} signals", color = Muted, modifier = Modifier.align(Alignment.CenterVertically))
        }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(165.dp),
            contentPadding = PaddingValues(30.dp),
            horizontalArrangement = Arrangement.spacedBy(13.dp), verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            items(shown, key = { it.url }) { channel -> MovieCard(channel, poster = posterView, channel.url in favorites, { onPlay(channel) }, { onFavorite(channel) }) }
        }
    }
}

@Composable
private fun FilterStepper(label: String, value: String?, choices: List<String>, onChange: (String?) -> Unit) {
    Button(onClick = {
        val position = choices.indexOf(value)
        onChange(if (position < 0 && choices.isNotEmpty()) choices.first() else choices.getOrNull(position + 1))
    }) { Text("$label, ${value ?: "All"}", maxLines = 1) }
}

@Composable
private fun Metric(label: String, value: String) {
    Column(Modifier.padding(start = 12.dp).width(75.dp).height(50.dp).background(Color(0x80020711), RoundedCornerShape(12.dp)).border(1.dp, Border, RoundedCornerShape(12.dp)).padding(9.dp)) {
        Text(label, color = Muted, fontSize = 8.sp, fontWeight = FontWeight.Bold); Text(value, color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

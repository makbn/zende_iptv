package com.zende.androidtv.ui.screen.discover

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.zende.androidtv.model.Channel
import com.zende.androidtv.model.GuideRow
import com.zende.androidtv.ui.component.SearchComponent
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Brand
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DiscoverScreen(rows: List<GuideRow>, favoriteCount: Int, onSearch: (String) -> Unit, onPlay: (Channel) -> Unit, onRecord: (Channel) -> Unit) {
    var query by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 36.dp)) {
            Text("Guide", color = Muted, fontSize = 13.sp)
            Text("TV guide", color = Ink, fontSize = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
            Text("Search every live channel and programme, preview it, and inspect the complete provider schedule.", color = Muted, fontSize = 16.sp, modifier = Modifier.padding(top = 12.dp))
            Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GuideChip("$favoriteCount favorites")
                GuideChip("Guide ready")
            }
        }
        Box(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 16.dp).background(Color(0xFF080D17), RoundedCornerShape(18.dp)).border(6.dp, Color(0xFF111827), RoundedCornerShape(18.dp)).padding(18.dp)) {
            SearchComponent(query, "Search channels or programmes — TSN, tennis, US Open…", { query = it; onSearch(it) }, Modifier.fillMaxWidth())
        }
        Column(Modifier.fillMaxSize().padding(horizontal = 32.dp, vertical = 8.dp).background(Color(0xFF080D17), RoundedCornerShape(18.dp)).border(6.dp, Color(0xFF111827), RoundedCornerShape(18.dp)).padding(18.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("CHANNELS", color = Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp); Text("Now and next for every result. Open a row for the live preview and complete schedule.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp)) }
                GuideChip("${rows.size} shown")
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 10.dp)) {
            items(rows, key = { it.channel.url }) { row ->
                Row(Modifier.fillMaxWidth().height(116.dp).background(Color(0xFF111827), RoundedCornerShape(14.dp)).border(1.dp, Border, RoundedCornerShape(14.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    AsyncImage(row.channel.artUrl, null, Modifier.width(60.dp).height(60.dp).background(Color(0xFF090E18), RoundedCornerShape(10.dp)), contentScale = ContentScale.Fit)
                    Column(Modifier.width(410.dp).padding(start = 14.dp)) { Text(row.channel.displayTitle, color = Ink, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(row.channel.groupTitle.orEmpty(), color = Muted, fontSize = 11.sp, maxLines = 1); Text("Open preview & complete guide", color = Ink, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp)) }
                    row.programmes.take(2).forEachIndexed { index, program ->
                        Column(Modifier.weight(1f).height(82.dp).background(if (index == 0) Color(0xFF171E2A) else Color(0xFF090E18), RoundedCornerShape(12.dp)).padding(12.dp)) {
                            Text(if (index == 0) "LIVE NOW   ${clock(program.startMs)}–${clock(program.stopMs)}" else "UP NEXT   ${clock(program.startMs)}–${clock(program.stopMs)}", color = Muted, fontSize = 9.sp, letterSpacing = 1.sp)
                            Text(program.title, color = Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(program.description.orEmpty(), color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Text("›", color = Muted, fontSize = 28.sp, modifier = Modifier.padding(start = 18.dp, end = 8.dp))
                }
            }
            }
        }
    }
}

@Composable private fun GuideChip(label: String) {
    Text(label, color = Muted, fontSize = 12.sp, modifier = Modifier.background(Color(0xFF111827), RoundedCornerShape(18.dp)).border(1.dp, Border, RoundedCornerShape(18.dp)).padding(horizontal = 13.dp, vertical = 8.dp))
}

private fun clock(milliseconds: Long): String = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(milliseconds))

package com.zende.androidtv.ui.screen.recordings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import com.zende.androidtv.model.Recording
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Brand
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface

@Composable
fun RecordingsScreen(recordings: List<Recording>, onPlay: (Recording) -> Unit) {
    val active = recordings.filter { it.status == "RECORDING" || it.status == "SCHEDULED" }
    val library = recordings - active.toSet()
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 38.dp)) {
            Text("Recorder", color = Muted, fontSize = 13.sp)
            Text("Recordings", color = Ink, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Text("Schedule, monitor, play, and download recordings.", color = Muted, fontSize = 15.sp)
            Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.CenterVertically) {
                RecordChip("${active.count { it.status == "SCHEDULED" }} scheduled")
                RecordChip("${active.count { it.status == "RECORDING" }} active")
                RecordChip("${library.size} saved")
                androidx.tv.material3.Button(onClick = {}) { Text("＋ Start a recording") }
            }
        }
        LazyColumn(contentPadding = PaddingValues(horizontal = 32.dp, vertical = 0.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            if (active.isNotEmpty()) item { Text("ACTIVE & SCHEDULED", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 6.dp)) }
            items(active, key = { it.id }) { RecordingRow(it, onPlay) }
            item { Text("Finished recordings", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth().border(1.dp, Border.copy(alpha = .55f)).padding(vertical = 10.dp)) }
            if (library.isEmpty()) item { Text("Finished recordings and failed captures appear here. Failed rows show the server error and cannot be played or downloaded.", color = Ink, fontSize = 14.sp, modifier = Modifier.padding(top = 34.dp)) }
            items(library, key = { it.id }) { RecordingRow(it, onPlay) }
        }
    }
}

@Composable private fun RecordChip(label: String) { Text(label, color = Muted, fontSize = 12.sp, modifier = Modifier.background(Color(0xFF111827), RoundedCornerShape(18.dp)).border(1.dp, Border, RoundedCornerShape(18.dp)).padding(horizontal = 13.dp, vertical = 8.dp)) }

@Composable private fun Stat(label: String, value: Int) { Column(Modifier.width(120.dp)) { Text(label, color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text(value.toString(), color = Ink, fontSize = 23.sp, fontWeight = FontWeight.Bold) } }

@Composable private fun RecordingRow(recording: Recording, onPlay: (Recording) -> Unit) {
    Row(Modifier.fillMaxWidth().height(88.dp).background(Color(0xFF09111F), RoundedCornerShape(12.dp)).border(1.dp, Border, RoundedCornerShape(12.dp)).clickable(enabled = recording.status != "RECORDING" && recording.status != "SCHEDULED") { onPlay(recording) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        AsyncImage(recording.channelLogo, null, Modifier.width(88.dp).height(60.dp).background(Surface, RoundedCornerShape(8.dp)), contentScale = ContentScale.Fit)
        Column(Modifier.weight(1f).padding(horizontal = 16.dp)) { Text(recording.channelName, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(recording.channelGroup.orEmpty(), color = Muted, fontSize = 12.sp) }
        Text(recording.status.replace('_', ' '), color = if (recording.status == "RECORDING") Brand else Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        recording.sizeBytes?.let { Text("  •  ${formatBytes(it)}", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(start = 16.dp)) }
    }
}

private fun formatBytes(value: String): String = value.toDoubleOrNull()?.let { "%.1f GB".format(it / 1_073_741_824.0) } ?: ""

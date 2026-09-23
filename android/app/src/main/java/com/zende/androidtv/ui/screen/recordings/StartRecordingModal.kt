package com.zende.androidtv.ui.screen.recordings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.modal.ZendeDialog

@Composable
fun StartRecordingModal(channel: Channel, onStart: (Int) -> Unit, onDismiss: () -> Unit) {
    ZendeDialog("Record ${channel.displayTitle}", "Choose how long this channel should be recorded.", onDismiss) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 18.dp)) {
            listOf(30, 60, 120, 240).forEach { minutes -> Button(onClick = { onStart(minutes) }) { Text("$minutes min") } }
        }
    }
}

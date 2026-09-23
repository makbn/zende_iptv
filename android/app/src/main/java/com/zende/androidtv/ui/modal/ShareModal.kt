package com.zende.androidtv.ui.modal

import androidx.compose.runtime.Composable
import androidx.tv.material3.Text
import com.zende.androidtv.model.Channel

@Composable
fun ShareModal(channel: Channel, onDismiss: () -> Unit) {
    ZendeDialog("Share ${channel.displayTitle}", "Create share links from Zende on the web.", onDismiss) { Text("This TV keeps your account and stream URLs private.") }
}

package com.zende.androidtv.ui.modal

import androidx.compose.runtime.Composable
import androidx.tv.material3.Text

@Composable
fun HeaderWatchTogetherModal(onDismiss: () -> Unit) {
    ZendeDialog("Watch together", "Create a synchronized room from the selected player.", onDismiss) { Text("Open a title and choose Watch Together from its player controls.") }
}

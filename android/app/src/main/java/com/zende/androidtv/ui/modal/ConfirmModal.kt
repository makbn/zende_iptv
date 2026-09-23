package com.zende.androidtv.ui.modal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface

@Composable
fun ZendeDialog(title: String, description: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.width(620.dp).background(Surface, RoundedCornerShape(20.dp)).border(1.dp, Border, RoundedCornerShape(20.dp)).padding(28.dp)) {
            Text(title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 24.sp)
            Text(description, color = Muted, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp, bottom = 10.dp))
            content()
        }
    }
}

@Composable
fun ConfirmModal(title: String, description: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    ZendeDialog(title, description, onDismiss) {
        Row(Modifier.fillMaxWidth().padding(top = 14.dp)) { Button(onClick = onConfirm) { Text("Confirm") }; Button(onClick = onDismiss, modifier = Modifier.padding(start = 12.dp)) { Text("Cancel") } }
    }
}

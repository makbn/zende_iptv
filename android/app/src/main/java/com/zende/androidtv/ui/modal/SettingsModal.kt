package com.zende.androidtv.ui.modal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.zende.androidtv.ui.component.SearchComponent
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.Surface

@Composable
fun SettingsModal(username: String?, serverUrl: String, onServerChange: (String) -> Unit, onLogout: () -> Unit, onDismiss: () -> Unit) {
    var address by remember(serverUrl) { mutableStateOf(serverUrl) }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 38.dp)) {
            Text("Settings", color = Muted, fontSize = 13.sp)
            Text("Settings", color = Ink, fontSize = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
            Text("Manage providers, playback, access, integrations, VPN routing, and server tools.", color = Muted, fontSize = 16.sp, modifier = Modifier.padding(top = 12.dp))
            Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SettingsChip("Personal settings"); SettingsChip("1 section")
            }
        }
        Text("My account", color = Ink, fontSize = 15.sp, modifier = Modifier.fillMaxWidth().border(1.dp, Border.copy(alpha = .55f)).padding(horizontal = 32.dp, vertical = 18.dp))
        Column(Modifier.fillMaxWidth().padding(32.dp).background(Color(0xFF080D17), RoundedCornerShape(18.dp)).border(6.dp, Color(0xFF111827), RoundedCornerShape(18.dp)).padding(24.dp)) {
            Text("Authentication", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text("Optional login protects this deployment. Access and refresh tokens are stored on this TV until you sign out.", color = Ink, fontSize = 14.sp, modifier = Modifier.padding(top = 10.dp))
            Row(Modifier.padding(top = 22.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Signed in as ${username ?: "Guest"}", color = Ink, fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp))
                if (username != null) Button(onClick = onLogout) { Text("Sign out") }
                Button(onClick = onDismiss) { Text("Close") }
            }
            Column(Modifier.fillMaxWidth().padding(top = 22.dp).background(Color(0xFF090E18), RoundedCornerShape(14.dp)).border(1.dp, Border, RoundedCornerShape(14.dp)).padding(18.dp)) {
                Text("Android TV server", color = Ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text("Use the same Zende host as the web app.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    SearchComponent(address, "https://zende.example", { address = it }, Modifier.weight(1f))
                    Button(onClick = { onServerChange(address); onDismiss() }) { Text("Save") }
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp).background(Surface, RoundedCornerShape(16.dp)).border(1.dp, Border, RoundedCornerShape(16.dp)).padding(24.dp)) {
            Text("Stream URL handling", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text("Zende fetches streams on the server, so public CORS-proxy wrappers can be stripped to the direct URL for reliable TV playback.", color = Ink, fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp))
            Text("☑  Unwrap public CORS-proxy URLs for server playback", color = Ink, fontSize = 14.sp, modifier = Modifier.fillMaxWidth().padding(top = 18.dp).background(Color(0xFF090E18), RoundedCornerShape(12.dp)).border(1.dp, Border, RoundedCornerShape(12.dp)).padding(18.dp))
        }
    }
}

@Composable private fun SettingsChip(label: String) {
    Text(label, color = Muted, fontSize = 12.sp, modifier = Modifier.background(Color(0xFF111827), RoundedCornerShape(18.dp)).border(1.dp, Border, RoundedCornerShape(18.dp)).padding(horizontal = 13.dp, vertical = 8.dp))
}

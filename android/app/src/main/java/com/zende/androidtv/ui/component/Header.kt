package com.zende.androidtv.ui.component

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import com.zende.androidtv.model.Destination
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Brand
import com.zende.androidtv.ui.theme.FocusBlue
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted

@Composable
fun Header(
    selected: Destination,
    username: String?,
    onNavigate: (Destination) -> Unit,
    onSearch: () -> Unit,
    onSettings: () -> Unit,
    modifier: Modifier = Modifier,
    overlay: Boolean = false,
) {
    Row(
        modifier = modifier.fillMaxWidth().height(64.dp)
            .background(if (overlay) Color.Transparent else Color(0xE6020711))
            .border(width = 1.dp, color = if (overlay) Color.Transparent else Border.copy(alpha = .65f))
            .padding(horizontal = 30.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
                listOf(5, 9, 13, 9, 5).forEach { h ->
                    Box(Modifier.width(2.dp).height(h.dp).background(Brand, RoundedCornerShape(1.dp)))
                }
            }
            Spacer(Modifier.width(9.dp))
            Text("Zende", color = Ink, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Spacer(Modifier.width(7.dp))
            Text("Live", color = Muted, fontSize = 12.sp)
        }
        Spacer(Modifier.weight(1f))
        Destination.entries.forEach { destination ->
            NavItem(destination.label, selected == destination) { onNavigate(destination) }
        }
        Spacer(Modifier.weight(1f))
        HeaderIcon(Icons.Outlined.Search, "Search", onSearch)
        HeaderIcon(Icons.Outlined.Settings, "Settings", onSettings)
    }
}

@Composable
private fun NavItem(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val line by animateColorAsState(if (selected || focused) FocusBlue else Color.Transparent, label = "nav")
    Box(
        modifier = Modifier.width(106.dp).height(64.dp).padding(horizontal = 10.dp).onFocusChanged { focused = it.isFocused }
            .onKeyEvent { event ->
                if (event.key == Key.Enter || event.key == Key.DirectionCenter) { onClick(); true } else false
            }.focusable().semantics { role = Role.Tab },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (selected || focused) Ink else Muted, fontSize = 14.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Clip)
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(2.dp).background(line))
    }
}

@Composable
private fun HeaderIcon(icon: ImageVector, description: String, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Box(
        Modifier.padding(horizontal = 3.dp).size(38.dp).clip(CircleShape)
            .background(if (focused) FocusBlue else Color.Transparent)
            .onFocusChanged { focused = it.isFocused }
            .onKeyEvent { if (it.key == Key.Enter || it.key == Key.DirectionCenter) { onClick(); true } else false }
            .focusable().semantics { role = Role.Button },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, description, tint = if (focused) Color.White else Muted, modifier = Modifier.size(20.dp)) }
}

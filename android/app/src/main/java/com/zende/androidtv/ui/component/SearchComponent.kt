package com.zende.androidtv.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.FocusBlue
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted

@Composable
fun SearchComponent(value: String, placeholder: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier.height(48.dp).background(Color(0x80020711), RoundedCornerShape(15.dp))
            .border(if (focused) 2.dp else 1.dp, if (focused) FocusBlue else Border, RoundedCornerShape(15.dp))
            .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Search, null, tint = Muted, modifier = Modifier.padding(end = 12.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(color = Ink, fontSize = 15.sp),
            modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            decorationBox = { inner -> if (value.isEmpty()) Text(placeholder, color = Muted, fontSize = 15.sp); inner() },
        )
    }
}

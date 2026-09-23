package com.zende.androidtv.ui.screen.login

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.zende.androidtv.model.PairSession
import com.zende.androidtv.ui.theme.Border
import com.zende.androidtv.ui.theme.Canvas
import com.zende.androidtv.ui.theme.FocusBlue
import com.zende.androidtv.ui.theme.Ink
import com.zende.androidtv.ui.theme.Muted
import com.zende.androidtv.ui.theme.SurfaceRaised

@Composable
fun LoginScreen(pair: PairSession?, busy: Boolean, error: String?, onLogin: (String, String) -> Unit, onCancel: () -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Canvas)) {
        Text("☼", color = Muted, fontSize = 18.sp, modifier = Modifier.align(Alignment.TopEnd).padding(24.dp))
        Column(Modifier.width(520.dp).align(Alignment.TopCenter).padding(top = 62.dp)) {
            Text("ZENDE", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
            Text("Sign in", color = Ink, fontSize = 29.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
            Text("Enter your account details to continue, or scan the QR code with your phone.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
            Spacer(Modifier.height(32.dp))
            Box(Modifier.fillMaxWidth().background(Color(0xFF070D18), RoundedCornerShape(20.dp)).border(6.dp, SurfaceRaised, RoundedCornerShape(20.dp)).padding(26.dp)) {
                Column {
                    Text("SIGN IN WITH PHONE", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text("Scan with a phone already signed in to Zende, then approve this TV.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
                    Row(Modifier.padding(top = 18.dp), verticalAlignment = Alignment.Top) {
                        Box(Modifier.size(270.dp).background(SurfaceRaised, RoundedCornerShape(14.dp)).padding(13.dp), contentAlignment = Alignment.Center) {
                            pair?.verificationUri?.let { uri -> Image(qrCode(uri).asImageBitmap(), "Sign-in QR code", Modifier.fillMaxSize()) }
                        }
                        Column(Modifier.padding(start = 18.dp, top = 4.dp)) {
                            Text("Waiting for your phone…", color = Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Text(pair?.verificationUri ?: "Creating a secure pairing session…", color = Muted, fontSize = 11.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 12.dp))
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 28.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).height(1.dp).background(Border)); Text("OR TYPE HERE", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 14.dp)); Box(Modifier.weight(1f).height(1.dp).background(Border))
            }
            LoginField("Username", username, false) { username = it }
            Spacer(Modifier.height(17.dp))
            LoginField("Password", password, true) { password = it }
            error?.let { Text(it, color = Color(0xFFFF6B72), fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp)) }
            Row(Modifier.padding(top = 22.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { onLogin(username, password) }, enabled = !busy && username.isNotBlank() && password.isNotBlank(), colors = ButtonDefaults.colors(containerColor = Color.White, contentColor = Color.Black)) {
                    Text(if (busy) "Signing in…" else "Continue")
                }
                Button(onClick = onCancel, colors = ButtonDefaults.colors(containerColor = FocusBlue, contentColor = Color.White)) { Text("Cancel") }
            }
        }
    }
}

@Composable
private fun LoginField(label: String, value: String, secret: Boolean, onValueChange: (String) -> Unit) {
    Column {
        Text(label, color = Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        BasicTextField(
            value, onValueChange, singleLine = true,
            visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            textStyle = TextStyle(color = Ink, fontSize = 16.sp),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(48.dp).background(Color(0xFF253249), RoundedCornerShape(12.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
        )
    }
}

private fun qrCode(value: String): Bitmap {
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 512, 512)
    return Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888).also { bitmap ->
        for (x in 0 until matrix.width) for (y in 0 until matrix.height) bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
    }
}

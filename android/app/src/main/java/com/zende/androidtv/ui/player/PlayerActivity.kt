package com.zende.androidtv.ui.player

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.zende.androidtv.ui.theme.ZendeTheme

class PlayerActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL).orEmpty()
        val token = intent.getStringExtra(EXTRA_TOKEN)
        val cookies = intent.getStringExtra(EXTRA_COOKIES)
        val contentType = intent.getStringExtra(CONTENT_TYPE)
        val launch = PlaybackHandoff.launch?.takeIf { it.isVod }
        setContent {
            ZendeTheme {
                if (launch != null && url.isNotBlank()) VodPlayer(url, token, cookies, launch)
                else VideoPlayer(url, contentType ?: "live", token, cookies)
            }
        }
    }

    companion object {
        const val EXTRA_TITLE = "title"
        const val EXTRA_URL = "url"
        const val CONTENT_TYPE = "contentType"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_COOKIES = "cookies"
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun VideoPlayer(url: String, contentType: String, token: String?, cookies: String?) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val player = remember(url) {
        val headers = buildMap {
            token?.takeIf(String::isNotBlank)?.let { put("Authorization", "Bearer $it") }
            cookies?.takeIf(String::isNotBlank)?.let { put("Cookie", it) }
        }
        val dataSource = DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).setAllowCrossProtocolRedirects(true)
        ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(dataSource)).build().apply {
            if ("live" == contentType) {
                setMediaSource(HlsMediaSource.Factory(dataSource).createMediaSource(MediaItem.fromUri(url)))
            }else{
                setMediaItem(MediaItem.fromUri(url))
            }

            prepare(); playWhenReady = true
            addListener(object : androidx.media3.common.Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    super.onPlayerError(error)
                    error.printStackTrace();
                }
            })
        }
    }

    DisposableEffect(player) { onDispose { player.release() } }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { context -> PlayerView(context).apply { this.player = player; useController = true; requestFocus() } }, modifier = Modifier.fillMaxSize())
    }
}

package com.zende.androidtv.ui.player

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import com.zende.androidtv.api.PlaybackApi
import com.zende.androidtv.api.ZendeApiFactory
import com.zende.androidtv.model.IntroSegment
import com.zende.androidtv.model.StreamSessionRequest
import com.zende.androidtv.model.SubtitleHit
import com.zende.androidtv.model.SubtitleLoadRequest
import com.zende.androidtv.ui.theme.Brand
import com.zende.androidtv.ui.theme.FocusBlue
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(UnstableApi::class)
@Composable
fun VodPlayer(initialUrl: String, token: String?, cookies: String?, initial: PlaybackLaunch) {
    val context = LocalContext.current
    val api = remember { PlaybackApi(ZendeApiFactory(context.applicationContext)) }
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf(initial) }
    var videoUrl by remember { mutableStateOf(initialUrl) }
    var controls by remember { mutableStateOf(true) }
    var controlTick by remember { mutableIntStateOf(0) }
    var switching by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var position by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }
    var playing by remember { mutableStateOf(true) }
    var segments by remember { mutableStateOf<List<IntroSegment>>(emptyList()) }
    var subtitlesOpen by remember { mutableStateOf(false) }
    var episodesOpen by remember { mutableStateOf(false) }
    var activeSubtitle by remember { mutableStateOf<String?>(null) }
    val playFocus = remember { FocusRequester() }
    val skipFocus = remember { FocusRequester() }

    val player = remember(initialUrl) {
        val headers = buildMap {
            token?.takeIf(String::isNotBlank)?.let { put("Authorization", "Bearer $it") }
            cookies?.takeIf(String::isNotBlank)?.let { put("Cookie", it) }
        }
        val dataSource = DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).setAllowCrossProtocolRedirects(true)
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(dataSource))
            .build()
            .apply {
                setMediaItem(MediaItem.fromUri(initialUrl))
                prepare()
                playWhenReady = true
            }
    }
    DisposableEffect(player) { onDispose { player.release() } }

    LaunchedEffect(player) {
        while (true) {
            position = player.currentPosition
            duration = player.duration.coerceAtLeast(0L)
            playing = player.isPlaying
            delay(400)
        }
    }
    LaunchedEffect(controls, controlTick, playing, subtitlesOpen, episodesOpen) {
        if (!controls || !playing || subtitlesOpen || episodesOpen) return@LaunchedEffect
        delay(7_000)
        controls = false
    }
    LaunchedEffect(current.imdbId, current.tmdbId, current.season, current.episodeNum) {
        if (current.imdbId.isNullOrBlank() && current.tmdbId.isNullOrBlank()) {
            segments = emptyList()
            return@LaunchedEffect
        }
        segments = runCatching {
            api.intro(
                current.imdbId,
                current.tmdbId,
                current.season?.toIntOrNull()?.takeIf { it > 0 },
                current.episodeNum?.toIntOrNull()?.takeIf { it > 0 },
            ).segments
        }.getOrDefault(emptyList())
    }
    val intro = segments.firstOrNull { position in it.startMs until it.endMs }
    LaunchedEffect(intro?.endMs) {
        if (intro != null) skipFocus.requestFocus()
    }

    fun showControls() {
        controls = true
        controlTick += 1
    }

    fun switchEpisode(index: Int) {
        val episode = current.episodes.getOrNull(index) ?: return
        if (switching || index == current.episodeIndex) return
        switching = true
        episodesOpen = false
        notice = null
        scope.launch {
            val next = current.copy(
                title = listOfNotNull(current.seriesTitle, "S${episode.season}E${episode.episodeNum}", episode.title).joinToString(" · "),
                upstreamUrl = episode.playUrl,
                season = episode.season,
                episodeNum = episode.episodeNum,
                episodeIndex = index,
                durationSeconds = episode.durationSeconds,
                releaseName = listOfNotNull(current.seriesTitle, episode.title).joinToString(" "),
            )
            runCatching {
                api.open(StreamSessionRequest(url = next.upstreamUrl, title = next.title, meta = next.toMeta()))
            }.onSuccess { session ->
                val nextUrl = api.serverUrl.trimEnd('/') + "/api/stream/proxy/${session.id}"
                videoUrl = nextUrl
                current = next
                activeSubtitle = null
                player.setMediaItem(MediaItem.fromUri(nextUrl))
                player.prepare()
                player.playWhenReady = true
            }.onFailure { error ->
                notice = error.message ?: "Could not open that episode."
            }
            switching = false
        }
    }

    fun applySubtitle(vttUrl: String?, language: String?, label: String?) {
        val item = MediaItem.Builder().setUri(videoUrl).apply {
            if (!vttUrl.isNullOrBlank()) {
                setSubtitleConfigurations(
                    listOf(
                        MediaItem.SubtitleConfiguration.Builder(Uri.parse(vttUrl))
                            .setMimeType(MimeTypes.TEXT_VTT)
                            .setLanguage(language ?: "und")
                            .setLabel(label ?: "Subtitles")
                            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                            .build(),
                    ),
                )
            }
        }.build()
        val at = player.currentPosition.coerceAtLeast(0L)
        val resume = player.playWhenReady
        player.setMediaItem(item, at)
        player.prepare()
        player.playWhenReady = resume
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, vttUrl.isNullOrBlank())
            .build()
        activeSubtitle = label
    }

    BackHandler {
        when {
            subtitlesOpen -> subtitlesOpen = false
            episodesOpen -> episodesOpen = false
            else -> (context as? android.app.Activity)?.finish()
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black).onPreviewKeyEvent { event ->
            if (event.type != KeyEventType.KeyDown || subtitlesOpen || episodesOpen || switching) return@onPreviewKeyEvent switching
            if (controls) {
                showControls()
                return@onPreviewKeyEvent false
            }
            when (event.key) {
                Key.DirectionLeft -> {
                    player.seekTo((player.currentPosition - 10_000).coerceAtLeast(0))
                    showControls()
                    true
                }
                Key.DirectionRight -> {
                    player.seekTo(player.currentPosition + 10_000)
                    showControls()
                    true
                }
                Key.DirectionCenter, Key.Enter -> {
                    if (intro != null) {
                        false
                    } else {
                        player.playWhenReady = !player.playWhenReady
                        showControls()
                        true
                    }
                }
                Key.DirectionUp, Key.DirectionDown -> {
                    showControls()
                    true
                }
                else -> false
            }
        },
    ) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    this.player = player
                    useController = false
                    isFocusable = false
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        notice?.let {
            Text(it, color = Color.White, modifier = Modifier.align(Alignment.TopCenter).padding(top = 36.dp).background(Color(0xCC1A2231), androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).padding(horizontal = 18.dp, vertical = 10.dp))
        }
        if (intro != null) {
            Button(
                onClick = { player.seekTo(intro.endMs) },
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 64.dp, bottom = if (controls) 132.dp else 48.dp).focusRequester(skipFocus),
                colors = ButtonDefaults.colors(containerColor = Color.White, contentColor = Color.Black, focusedContainerColor = Color.White, focusedContentColor = Color.Black),
                contentPadding = PaddingValues(horizontal = 22.dp, vertical = 12.dp),
            ) { Text("Skip intro", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
        }
        if (controls) {
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xC0000000)).padding(horizontal = 48.dp, vertical = 22.dp)) {
                Text(current.title, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${clock(position)}  /  ${clock(duration)}", color = Color.White.copy(alpha = .75f), fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (current.contentKind == "episode") {
                        PlayerButton("Prev", current.episodeIndex > 0 && !switching) { switchEpisode(current.episodeIndex - 1) }
                    }
                    PlayerButton(if (playing) "Pause" else "Play", true, playFocus) {
                        player.playWhenReady = !player.playWhenReady
                    }
                    if (current.contentKind == "episode") {
                        PlayerButton("Next", current.episodeIndex >= 0 && current.episodeIndex < current.episodes.lastIndex && !switching) {
                            switchEpisode(current.episodeIndex + 1)
                        }
                        PlayerButton("Episodes", current.episodes.isNotEmpty()) { episodesOpen = true }
                    }
                    PlayerButton("Subtitles", true) { subtitlesOpen = true }
                    activeSubtitle?.let { Text(it, color = Color.White.copy(alpha = .8f), fontSize = 13.sp, modifier = Modifier.align(Alignment.CenterVertically).padding(start = 8.dp)) }
                }
            }
        }
        if (switching) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .72f)), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Loading episode…", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Text("Opening the next stream", color = Color.White.copy(alpha = .7f), modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
        if (subtitlesOpen) {
            SubtitleDialog(api, current, onClose = { subtitlesOpen = false }) { vtt, language, label ->
                applySubtitle(vtt, language, label)
                subtitlesOpen = false
            }
        }
        if (episodesOpen) {
            EpisodeDialog(current, onClose = { episodesOpen = false }, onPlay = ::switchEpisode)
        }
    }
    LaunchedEffect(controls) {
        if (controls && intro == null) runCatching { playFocus.requestFocus() }
    }
}

@Composable
private fun PlayerButton(label: String, enabled: Boolean, focus: FocusRequester? = null, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = if (focus != null) Modifier.focusRequester(focus) else Modifier,
        colors = ButtonDefaults.colors(
            containerColor = Color(0xFF1A2231),
            contentColor = Color.White,
            focusedContainerColor = Color.White,
            focusedContentColor = Color.Black,
            disabledContainerColor = Color(0xFF1A2231).copy(alpha = .45f),
            disabledContentColor = Color.White.copy(alpha = .35f),
        ),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp),
    ) { Text(label, fontWeight = FontWeight.Bold) }
}

@Composable
private fun SubtitleDialog(
    api: PlaybackApi,
    launch: PlaybackLaunch,
    onClose: () -> Unit,
    onSelect: (vttUrl: String?, language: String?, label: String?) -> Unit,
) {
    var hits by remember { mutableStateOf<List<SubtitleHit>>(emptyList()) }
    var status by remember { mutableStateOf("Searching subtitles…") }
    var loadingId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(launch.imdbId, launch.tmdbId, launch.season, launch.episodeNum) {
        if (launch.imdbId.isNullOrBlank() && launch.tmdbId.isNullOrBlank()) {
            status = "This title has no IMDb id yet."
            hits = emptyList()
            return@LaunchedEffect
        }
        val response = runCatching {
            api.searchSubtitles(
                imdbId = launch.imdbId,
                tmdbId = launch.tmdbId,
                season = launch.season?.toIntOrNull()?.takeIf { it > 0 },
                episode = launch.episodeNum?.toIntOrNull()?.takeIf { it > 0 },
                type = if (launch.contentKind == "episode") "episode" else "movie",
                releaseFilter = null,
            )
        }
        response.onSuccess { body ->
            val tokens = releaseTokens(launch.releaseName.orEmpty())
            hits = body.results.sortedByDescending { subtitleScore(it, tokens) }
            status = when {
                !body.enabled -> body.error ?: "Subtitle search is not configured."
                hits.isEmpty() -> body.error ?: "No subtitles found for this title."
                else -> ""
            }
        }.onFailure { error ->
            hits = emptyList()
            status = error.message ?: "Subtitle search failed."
        }
    }
    DialogScrim(onClose) {
        Text("SUBTITLES", color = Brand, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
        Text(launch.seriesTitle ?: launch.title, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        launch.releaseName?.takeIf { it.isNotBlank() }?.let {
            Text(it, color = Color.White.copy(alpha = .65f), fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
        }
        if (status.isNotBlank()) Text(status, color = Color.White.copy(alpha = .8f), modifier = Modifier.padding(bottom = 12.dp))
        LazyColumn(Modifier.weight(1f).focusGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                DialogRow("Off", "Hide subtitles", loadingId == null) { onSelect(null, null, null) }
            }
            items(hits, key = { it.id + it.url }) { hit ->
                val label = "${hit.languageName.ifBlank { hit.language }} · ${hit.release}"
                DialogRow(
                    label,
                    if (hit.hearingImpaired) "Hearing impaired" else "Select",
                    loadingId == null,
                ) {
                    if (loadingId == null) {
                    loadingId = hit.id
                    scope.launch {
                        runCatching {
                            api.loadSubtitle(SubtitleLoadRequest(hit.url, label, hit.language.ifBlank { "und" }, hit.release))
                        }.onSuccess { loaded ->
                            val vtt = if (loaded.vttUrl.startsWith("http")) loaded.vttUrl else api.serverUrl.trimEnd('/') + "/" + loaded.vttUrl.trimStart('/')
                            onSelect(vtt, loaded.language, loaded.label.ifBlank { label })
                        }.onFailure { error ->
                            status = error.message ?: "Could not load that subtitle."
                            loadingId = null
                        }
                    }
                    }
                }
            }
        }
    }
}

@Composable
private fun EpisodeDialog(launch: PlaybackLaunch, onClose: () -> Unit, onPlay: (Int) -> Unit) {
    val seasons = remember(launch.episodes) {
        launch.episodes.map { it.season }.distinct().sortedBy { it.toIntOrNull() ?: 0 }
    }
    var season by remember(launch.season) { mutableStateOf(launch.season ?: seasons.firstOrNull().orEmpty()) }
    val visible = launch.episodes.mapIndexed { index, episode -> index to episode }.filter { it.second.season == season }
    DialogScrim(onClose) {
        Text(launch.seriesTitle ?: "Episodes", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text("Left and right change season. Up and down choose an episode.", color = Color.White.copy(alpha = .65f), modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
        LazyRow(Modifier.focusGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(seasons, key = { it }) { item ->
                Button(
                    onClick = { season = item },
                    modifier = Modifier.onFocusChanged { if (it.isFocused) season = item }.padding(bottom = 12.dp),
                    colors = ButtonDefaults.colors(
                        containerColor = if (item == season) FocusBlue else Color(0xFF1A2231),
                        contentColor = Color.White,
                        focusedContainerColor = Color.White,
                        focusedContentColor = Color.Black,
                    ),
                ) { Text("Season $item", fontWeight = FontWeight.Bold) }
            }
        }
        LazyColumn(Modifier.weight(1f).focusGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(visible, key = { it.second.playUrl }) { (index, episode) ->
                val current = index == launch.episodeIndex
                DialogRow(
                    "S${episode.season}E${episode.episodeNum}  ${episode.title}",
                    if (current) "Now playing" else "Play",
                    true,
                ) { onPlay(index) }
            }
        }
    }
}

@Composable
private fun DialogScrim(onClose: () -> Unit, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0xE6050810))) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 72.dp, vertical = 48.dp),
            content = content,
        )
    }
}

@Composable
private fun DialogRow(title: String, detail: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.colors(
            containerColor = Color(0xFF141B27),
            contentColor = Color.White,
            focusedContainerColor = Color.White,
            focusedContentColor = Color.Black,
        ),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Text(title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(detail, fontSize = 12.sp, color = Color.White.copy(alpha = .7f))
        }
    }
}

private val bracketTokens = Regex("\\[([^\\]]+)]")

private fun releaseTokens(raw: String): List<String> = bracketTokens.findAll(raw)
    .flatMap { it.groupValues[1].split('/', '+', ',', ' ') }
    .map { it.trim() }
    .filter { it.length in 2..16 }
    .toList()

private fun subtitleScore(hit: SubtitleHit, tokens: List<String>): Int {
    val haystack = "${hit.release} ${hit.languageName}".lowercase()
    val matches = tokens.count { haystack.contains(it.lowercase()) }
    return matches * 10 + if (hit.hearingImpaired) 0 else 1
}

private fun clock(ms: Long): String {
    if (ms <= 0L) return "0:00"
    val total = (ms / 1000L).toInt()
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
}

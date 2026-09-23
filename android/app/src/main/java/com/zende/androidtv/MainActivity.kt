package com.zende.androidtv

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.sp
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.focusGroup
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.Text
import com.zende.androidtv.model.Destination
import com.zende.androidtv.model.Channel
import com.zende.androidtv.ui.ZendeUiState
import com.zende.androidtv.ui.ZendeViewModel
import com.zende.androidtv.ui.component.Header
import com.zende.androidtv.ui.modal.HeaderSearchModal
import com.zende.androidtv.ui.modal.SettingsModal
import com.zende.androidtv.ui.modal.ShareModal
import com.zende.androidtv.ui.player.PlayerActivity
import com.zende.androidtv.ui.screen.discover.DiscoverScreen
import com.zende.androidtv.ui.screen.favorites.FavoritesScreen
import com.zende.androidtv.ui.screen.home.HomeScreen
import com.zende.androidtv.ui.screen.library.LibraryScreen
import com.zende.androidtv.ui.screen.login.LoginScreen
import com.zende.androidtv.ui.screen.recordings.RecordingsScreen
import com.zende.androidtv.ui.screen.series.SeriesDetailScreen
import com.zende.androidtv.ui.screen.movie.MovieDetailScreen
import com.zende.androidtv.ui.theme.Brand
import com.zende.androidtv.ui.theme.Canvas
import com.zende.androidtv.ui.theme.ZendeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val deviceDensity = LocalDensity.current
            // The web app targets a ~2200 px-wide desktop canvas. TV devices commonly expose
            // only 960 x 540 dp even at 4K; normalize once so web measurements retain parity.
            CompositionLocalProvider(LocalDensity provides Density(deviceDensity.density * .45f, deviceDensity.fontScale)) {
                ZendeTheme {
                    val model: ZendeViewModel = viewModel(factory = ZendeViewModel.factory(applicationContext))
                    val state by model.state.collectAsStateWithLifecycle()
                    LaunchedEffect(model) {
                        model.playback.collect { request ->
                            startActivity(Intent(this@MainActivity, PlayerActivity::class.java).apply {
                                putExtra(PlayerActivity.EXTRA_TITLE, request.title)
                                putExtra(PlayerActivity.EXTRA_URL, request.url)
                                putExtra(PlayerActivity.CONTENT_TYPE, request.contentType)
                                putExtra(PlayerActivity.EXTRA_TOKEN, request.token)
                                putExtra(PlayerActivity.EXTRA_COOKIES, request.cookies)
                            })
                        }
                    }
                    ZendeApp(state, model)
                }
            }
        }
    }
}

@Composable
private fun ZendeApp(state: ZendeUiState, model: ZendeViewModel) {
    val activity = LocalActivity.current
    Box(Modifier.fillMaxSize().background(Canvas)) {
        when {
            state.booting -> LoadingScreen("Connecting to Zende…")
            !state.signedIn -> LoginScreen(state.pair, state.loginBusy, state.message, model::login) { activity?.finish() }
            else -> {
                val headerFocus = remember { FocusRequester() }
                val pageFocus = remember { FocusRequester() }

                val contentUnderHeader = (state.destination == Destination.Home || state.seriesChannel != null || state.movieChannel != null) && !state.settingsOpen
                if (contentUnderHeader) {
                    Box(Modifier.fillMaxSize()) {
                        Header(
                            state.destination, state.user?.username,
                            onNavigate = {
                                model.navigate(it)
                                if (it == Destination.Home) {
                                    pageFocus.requestFocus()
                                }
                            },
                            onSearch = { model.setSearchOpen(true) },
                            onSettings = { model.setSettingsOpen(true) },
                            overlay = true,
                            modifier = Modifier
                                .zIndex(1f)
                                .focusRequester(headerFocus)
                                .onKeyEvent {
                                    if (it.key == Key.DirectionDown && it.type == KeyEventType.KeyDown) {
                                        pageFocus.requestFocus()
                                        true
                                    } else false
                                }
                        )
                        Box(Modifier.focusRequester(pageFocus).focusGroup().onKeyEvent {
                            if (it.key == Key.DirectionUp && it.type == KeyEventType.KeyDown) {
                                headerFocus.requestFocus()
                                true
                            } else false
                        }) {
                            CurrentPage(state, model)
                        }
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        Header(
                            state.destination, state.user?.username,
                            onNavigate = {
                                model.navigate(it)
                                if (it == Destination.Home) {
                                    pageFocus.requestFocus()
                                }
                            },
                            onSearch = { model.setSearchOpen(true) },
                            onSettings = { model.setSettingsOpen(true) },
                            modifier = Modifier
                                .focusRequester(headerFocus)
                                .onKeyEvent {
                                    if (it.key == Key.DirectionDown && it.type == KeyEventType.KeyDown) {
                                        pageFocus.requestFocus()
                                        true
                                    } else false
                                }
                        )
                        Box(Modifier.weight(1f).focusRequester(pageFocus).focusGroup().onKeyEvent {
                            if (it.key == Key.DirectionUp && it.type == KeyEventType.KeyDown) {
                                headerFocus.requestFocus()
                                true
                            } else false
                        }) {
                            CurrentPage(state, model)
                        }
                    }
                }
            }
        }
        state.message?.takeIf { state.signedIn }?.let { message ->
            Text(message, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp).background(Brand, RoundedCornerShape(12.dp)).padding(horizontal = 20.dp, vertical = 11.dp))
        }
    }
    if (state.searchOpen) HeaderSearchModal(state.searchResults, state.favoriteUrls, model::search, model::openMedia, model::toggleFavorite) { model.setSearchOpen(false) }
    state.shareChannel?.let { ShareModal(it, model::closeShare) }
}

@Composable
private fun CurrentPage(state: ZendeUiState, model: ZendeViewModel) {
    Box(Modifier.fillMaxSize()) {
        if (state.movieChannel != null) {
            MovieDetailScreen(
                original = state.movieChannel,
                info = state.movieInfo,
                loading = state.movieLoading,
                error = state.movieError,
                favorite = (state.movieInfo?.channel?.url ?: state.movieChannel.url) in state.favoriteUrls,
                canDownload = state.user?.role == "ADMIN" && state.internalDownloadConfigured,
                onBack = model::closeMovie,
                onRetry = model::retryMovie,
                onPlay = model::play,
                onFavorite = model::toggleFavorite,
                onShare = model::showShare,
                onDownload = model::download,
            )
        } else if (state.seriesChannel != null) {
            SeriesDetailScreen(
                channel = state.seriesChannel,
                info = state.seriesInfo,
                loading = state.seriesLoading,
                error = state.seriesError,
                selectedSeason = state.selectedSeason,
                onBack = model::closeSeries,
                onRetry = model::retrySeries,
                onSeason = model::selectSeason,
                onPlay = { model.playEpisode(state.seriesChannel, it) },
                favorite = state.seriesChannel.url in state.favoriteUrls,
                canDownload = state.user?.role == "ADMIN" && state.internalDownloadConfigured,
                onFavorite = { model.toggleFavorite(state.seriesChannel) },
                onShare = { model.showShare(state.seriesChannel) },
                onDownload = { episode ->
                    model.download(
                        Channel(
                            url = episode.playUrl,
                            name = "${state.seriesChannel.displayTitle} · ${episode.code} · ${episode.title}",
                            tvgLogo = episode.artworkUrl ?: state.seriesChannel.posterUrl,
                            groupTitle = state.seriesChannel.groupTitle,
                            contentType = "episode",
                        )
                    )
                },
            )
        } else if (state.settingsOpen) {
            SettingsModal(state.user?.username, state.serverUrl, model::changeServer, model::logout) { model.setSettingsOpen(false) }
        } else when (state.destination) {
            Destination.Home -> HomeScreen(state.home, state.history, state.favoriteUrls, model::openMedia, model::toggleFavorite, state.refreshing)
            Destination.Library -> LibraryScreen(state.catalog, state.filters, state.favoriteUrls, model::setCatalogFilters, model::openMedia, model::toggleFavorite)
            Destination.Favorites -> FavoritesScreen(state.favorites, model::openMedia, model::toggleFavorite)
            Destination.Discover -> DiscoverScreen(state.guide, state.favorites.count(Channel::isLive), model::loadGuide, model::play) { model.startRecording(it, 60) }
            Destination.Recordings -> RecordingsScreen(state.recordings, model::playRecording)
        }
        if (state.refreshing && state.home.discover.channels.isEmpty()) LoadingScreen("Loading your library…")
    }
}

@Composable
private fun LoadingScreen(message: String) {
    Box(Modifier.fillMaxSize().background(Canvas), contentAlignment = Alignment.Center) { Text(message, color = Color.White, fontSize = 18.sp) }
}

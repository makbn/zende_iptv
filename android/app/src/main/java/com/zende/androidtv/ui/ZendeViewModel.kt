package com.zende.androidtv.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.zende.androidtv.api.ChannelApi
import com.zende.androidtv.api.SearchApi
import com.zende.androidtv.api.SeriesApi
import com.zende.androidtv.api.MovieApi
import com.zende.androidtv.api.SettingsApi
import com.zende.androidtv.api.UserApi
import com.zende.androidtv.api.ZendeApiFactory
import com.zende.androidtv.model.AuthState
import com.zende.androidtv.model.CatalogFilters
import com.zende.androidtv.model.CatalogResponse
import com.zende.androidtv.model.Channel
import com.zende.androidtv.model.Destination
import com.zende.androidtv.model.GuideRow
import com.zende.androidtv.model.HomeShelves
import com.zende.androidtv.model.PairSession
import com.zende.androidtv.model.PreferredGuideChannel
import com.zende.androidtv.model.Recording
import com.zende.androidtv.model.MediaMetadata
import com.zende.androidtv.model.SeriesEpisode
import com.zende.androidtv.model.SeriesInfo
import com.zende.androidtv.model.MovieInfo
import com.zende.androidtv.model.StreamSessionRequest
import com.zende.androidtv.model.User
import com.zende.androidtv.ui.player.PlaybackEpisodeRef
import com.zende.androidtv.ui.player.PlaybackHandoff
import com.zende.androidtv.ui.player.PlaybackLaunch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PlaybackRequest(
    val title: String,
    val url: String,
    val contentType: String,
    val token: String?,
    val cookies: String?,
    val launch: PlaybackLaunch? = null,
)

data class ZendeUiState(
    val booting: Boolean = true,
    val refreshing: Boolean = false,
    val auth: AuthState? = null,
    val destination: Destination = Destination.Home,
    val pair: PairSession? = null,
    val loginBusy: Boolean = false,
    val home: HomeShelves = HomeShelves(),
    val history: List<Channel> = emptyList(),
    val catalog: CatalogResponse = CatalogResponse(),
    val filters: CatalogFilters = CatalogFilters(),
    val favorites: List<Channel> = emptyList(),
    val guide: List<GuideRow> = emptyList(),
    val recordings: List<Recording> = emptyList(),
    val searchResults: List<Channel> = emptyList(),
    val searchOpen: Boolean = false,
    val settingsOpen: Boolean = false,
    val seriesChannel: Channel? = null,
    val seriesInfo: SeriesInfo? = null,
    val seriesLoading: Boolean = false,
    val seriesError: String? = null,
    val selectedSeason: String? = null,
    val movieChannel: Channel? = null,
    val movieInfo: MovieInfo? = null,
    val movieLoading: Boolean = false,
    val movieError: String? = null,
    val internalDownloadConfigured: Boolean = false,
    val shareChannel: Channel? = null,
    val serverUrl: String = "",
    val message: String? = null,
) {
    val signedIn: Boolean get() = auth?.let { !it.authEnabled || it.user != null } == true
    val user: User? get() = auth?.user
    val favoriteUrls: Set<String> get() = favorites.mapTo(linkedSetOf()) { it.url }
}

class ZendeViewModel(context: Context) : ViewModel() {
    private val factory = ZendeApiFactory(context)
    private val channels = ChannelApi(factory)
    private val user = UserApi(factory)
    private val search = SearchApi(factory)
    private val series = SeriesApi(factory)
    private val movies = MovieApi(factory)
    private val settings = SettingsApi(factory)
    private val mutableState = MutableStateFlow(ZendeUiState())
    val state = mutableState.asStateFlow()
    private val mutablePlayback = MutableSharedFlow<PlaybackRequest>()
    val playback = mutablePlayback.asSharedFlow()
    private var pairJob: Job? = null
    private var searchJob: Job? = null

    init {
        mutableState.update { it.copy(serverUrl = settings.serverUrl()) }
        bootstrap()
    }

    fun bootstrap() = viewModelScope.launch {
        mutableState.update { it.copy(booting = true, message = null) }
        runCatching { user.authState() }
            .onSuccess { auth ->
                mutableState.update { it.copy(booting = false, auth = auth) }
                if (!auth.authEnabled || auth.user != null) refreshEverything() else beginPairing()
            }
            .onFailure { error -> mutableState.update { it.copy(booting = false, message = error.readable()) } }
    }

    fun login(username: String, password: String) = viewModelScope.launch {
        mutableState.update { it.copy(loginBusy = true, message = null) }
        runCatching { user.login(username, password) }
            .onSuccess { response ->
                pairJob?.cancel()
                mutableState.update { it.copy(loginBusy = false, auth = AuthState(true, response.user), pair = null) }
                refreshEverything()
            }
            .onFailure { error -> mutableState.update { it.copy(loginBusy = false, message = error.readable()) } }
    }

    fun beginPairing() {
        pairJob?.cancel()
        pairJob = viewModelScope.launch {
            runCatching { user.createPair() }
                .onFailure { error -> mutableState.update { it.copy(message = error.readable()) } }
                .onSuccess { pair ->
                    mutableState.update { it.copy(pair = pair) }
                    while (true) {
                        delay(2_000)
                        val status = runCatching { user.pairStatus(pair.sessionId) }.getOrNull() ?: continue
                        when (status.status) {
                            "complete" -> {
                                user.savePairTokens(status)
                                mutableState.update { it.copy(auth = AuthState(true, status.user), pair = null, message = null) }
                                refreshEverything()
                                return@launch
                            }
                            "expired" -> { beginPairing(); return@launch }
                        }
                    }
                }
        }
    }

    fun navigate(destination: Destination) {
        mutableState.update {
            it.copy(
                destination = destination,
                seriesChannel = null,
                seriesInfo = null,
                seriesLoading = false,
                seriesError = null,
                selectedSeason = null,
                movieChannel = null,
                movieInfo = null,
                movieLoading = false,
                movieError = null,
            )
        }
        when (destination) {
            Destination.Library -> loadCatalog()
            Destination.Favorites -> loadFavorites()
            Destination.Discover -> loadGuide()
            Destination.Recordings -> loadRecordings()
            Destination.Home -> Unit
        }
    }

    fun refreshEverything() = viewModelScope.launch {
        mutableState.update { it.copy(refreshing = true, message = null) }
        listOf(
            async { runCatching { channels.home() }.onSuccess { value -> mutableState.update { it.copy(home = value) } } },
            async { runCatching { user.history() }.onSuccess { value -> mutableState.update { it.copy(history = value) } } },
            async { runCatching { user.favorites() }.onSuccess { value -> mutableState.update { it.copy(favorites = value) } } },
            async { runCatching { channels.catalog() }.onSuccess { value -> mutableState.update { it.copy(catalog = value) } } },
            async { runCatching { user.recordings() }.onSuccess { value -> mutableState.update { it.copy(recordings = value.active + value.schedules + value.library) } } },
        ).awaitAll()
        if (mutableState.value.user?.role == "ADMIN") {
            runCatching { movies.downloadSettings() }.onSuccess { value ->
                mutableState.update { it.copy(internalDownloadConfigured = value.configured) }
            }
        } else mutableState.update { it.copy(internalDownloadConfigured = false) }
        mutableState.value.history.firstOrNull()?.let { hero ->
            runCatching { channels.heroMetadata(hero) }.getOrNull()?.let { metadata ->
                mutableState.update { state -> state.copy(history = state.history.mapIndexed { index, channel -> if (index == 0) channel.copy(homeMetadata = metadata) else channel }) }
            }
        }
        mutableState.update { it.copy(refreshing = false) }
    }

    fun setCatalogFilters(filters: CatalogFilters) {
        mutableState.update { it.copy(filters = filters) }
        loadCatalog()
    }

    fun loadCatalog() = viewModelScope.launch {
        mutableState.update { it.copy(refreshing = true) }
        runCatching { channels.catalog(mutableState.value.filters) }
            .onSuccess { result -> mutableState.update { it.copy(catalog = result, refreshing = false) } }
            .onFailure { error -> mutableState.update { it.copy(refreshing = false, message = error.readable()) } }
    }

    fun loadFavorites() = viewModelScope.launch {
        runCatching { user.favorites() }.onSuccess { value -> mutableState.update { it.copy(favorites = value) } }
    }

    fun loadGuide(query: String = "") = viewModelScope.launch {
        val preferred = mutableState.value.favorites
            .filter(Channel::isLive)
            .mapNotNull { channel ->
                val providerId = channel.providerId?.trim().orEmpty()
                val tvgId = channel.tvgId?.trim().orEmpty()
                if (providerId.isNotEmpty() && tvgId.isNotEmpty()) PreferredGuideChannel(providerId, tvgId) else null
            }
        runCatching { channels.guide(query, preferred) }
            .onSuccess { value -> mutableState.update { it.copy(guide = value.results) } }
            .onFailure { error -> mutableState.update { it.copy(message = error.readable()) } }
    }

    fun loadRecordings() = viewModelScope.launch {
        runCatching { user.recordings() }
            .onSuccess { value -> mutableState.update { it.copy(recordings = value.active + value.schedules + value.library) } }
            .onFailure { error -> mutableState.update { it.copy(message = error.readable()) } }
    }

    fun toggleFavorite(channel: Channel) = viewModelScope.launch {
        val favorite = channel.url in mutableState.value.favoriteUrls
        runCatching { if (favorite) user.removeFavorite(channel) else user.addFavorite(channel) }
            .onSuccess { loadFavorites() }
            .onFailure { error -> mutableState.update { it.copy(message = error.readable()) } }
    }

    fun openMedia(channel: Channel) {
        when {
            channel.isSeriesContainer -> openSeries(channel)
            !channel.isLive -> openMovie(channel)
            else -> play(channel)
        }
    }

    fun openMovie(channel: Channel) {
        mutableState.update { it.copy(movieChannel = channel, movieInfo = null, movieLoading = true, movieError = null) }
        viewModelScope.launch {
            runCatching { movies.details(channel) }
                .onSuccess { info -> mutableState.update { it.copy(movieInfo = info, movieLoading = false) } }
                .onFailure { error -> mutableState.update { it.copy(movieLoading = false, movieError = error.readable()) } }
        }
    }

    fun closeMovie() = mutableState.update { it.copy(movieChannel = null, movieInfo = null, movieLoading = false, movieError = null) }
    fun retryMovie() { mutableState.value.movieChannel?.let(::openMovie) }

    fun download(channel: Channel) = viewModelScope.launch {
        if (mutableState.value.user?.role != "ADMIN" || !mutableState.value.internalDownloadConfigured) return@launch
        runCatching { movies.download(channel) }
            .onSuccess { result -> mutableState.update { it.copy(message = "Server download started: ${result.fileName}") } }
            .onFailure { error -> mutableState.update { it.copy(message = error.readable()) } }
    }

    fun showShare(channel: Channel) = mutableState.update { it.copy(shareChannel = channel) }
    fun closeShare() = mutableState.update { it.copy(shareChannel = null) }

    fun openSeries(channel: Channel) {
        mutableState.update {
            it.copy(
                seriesChannel = channel,
                seriesInfo = null,
                seriesLoading = true,
                seriesError = null,
                selectedSeason = null,
            )
        }
        viewModelScope.launch {
            runCatching { series.details(channel) }
                .onSuccess { info ->
                    val firstSeason = info.episodes.firstOrNull()?.season
                    mutableState.update {
                        it.copy(seriesInfo = info, seriesLoading = false, selectedSeason = firstSeason)
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(seriesLoading = false, seriesError = error.readable())
                    }
                }
        }
    }

    fun closeSeries() = mutableState.update {
        it.copy(seriesChannel = null, seriesInfo = null, seriesLoading = false, seriesError = null, selectedSeason = null)
    }

    fun retrySeries() {
        mutableState.value.seriesChannel?.let(::openSeries)
    }

    fun selectSeason(season: String) = mutableState.update { it.copy(selectedSeason = season) }

    fun playMovie() {
        val current = mutableState.value
        val original = current.movieChannel ?: return
        val info = current.movieInfo
        val channel = info?.channel?.takeIf { it.url.isNotBlank() } ?: original
        val metadata = info?.metadata
        val cleanTitle = PlaybackLaunch.cleanMediaDisplayTitle(metadata?.title ?: channel.displayTitle)
            .ifBlank { channel.displayTitle }
        play(
            channel.copy(
                name = cleanTitle,
                contentType = "movie",
                duration = info?.durationSeconds?.toDouble() ?: channel.duration,
            ),
            PlaybackLaunch(
                title = cleanTitle,
                upstreamUrl = channel.url,
                contentKind = "movie",
                displayTitle = cleanTitle,
                displaySubtitle = metadata?.year,
                imdbId = metadata.portalId(info?.info, "imdb"),
                tmdbId = metadata.portalId(info?.info, "tmdb"),
                releaseName = original.name,
                year = metadata?.year,
                durationSeconds = info?.durationSeconds,
            ),
        )
    }

    fun playEpisode(seriesChannel: Channel, episode: SeriesEpisode) {
        val info = mutableState.value.seriesInfo
        val episodes = info?.episodes.orEmpty()
        val index = episodes.indexOfFirst { it.playUrl == episode.playUrl }
        val metadata = info?.metadata
        val seriesTitle = PlaybackLaunch.cleanMediaDisplayTitle(metadata?.title ?: seriesChannel.displayTitle)
            .ifBlank { seriesChannel.displayTitle }
        val episodeTitle = PlaybackLaunch.cleanMediaDisplayTitle(episode.title).ifBlank { episode.title }
        val code = episode.code.ifBlank { "S${episode.season}E${episode.episodeNum.ifBlank { "?" }}" }
        val subtitle = "$code · $episodeTitle"
        val episodeRefs = episodes.map {
            PlaybackEpisodeRef(
                it.season,
                it.episodeNum,
                PlaybackLaunch.cleanMediaDisplayTitle(it.title).ifBlank { it.title },
                it.playUrl,
                it.durationSeconds,
            )
        }
        val previous = if (index > 0) PlaybackLaunch.neighborFrom(episodeRefs, index - 1) else null
        val next = if (index >= 0 && index < episodeRefs.lastIndex) {
            PlaybackLaunch.neighborFrom(episodeRefs, index + 1)
        } else {
            null
        }
        play(
            Channel(
                url = episode.playUrl,
                name = "$seriesTitle · $subtitle",
                tvgLogo = episode.artworkUrl ?: seriesChannel.posterUrl,
                groupTitle = seriesChannel.groupTitle,
                contentType = "episode",
                duration = episode.durationSeconds?.toDouble(),
            ),
            PlaybackLaunch(
                title = episodeTitle,
                upstreamUrl = episode.playUrl,
                contentKind = "episode",
                displayTitle = seriesTitle,
                displaySubtitle = subtitle,
                imdbId = metadata.portalId(info?.info, "imdb"),
                tmdbId = metadata.portalId(info?.info, "tmdb"),
                releaseName = "${seriesChannel.name} ${episode.title}".trim(),
                year = metadata?.year,
                season = episode.season,
                episodeNum = episode.episodeNum,
                seriesId = info?.seriesId?.takeIf { it.isNotBlank() },
                seriesTitle = seriesTitle,
                episodeIndex = index,
                durationSeconds = episode.durationSeconds,
                hasPrevious = previous != null,
                hasNext = next != null,
                previous = previous,
                next = next,
                episodes = episodeRefs,
            ),
        )
    }

    fun startRecording(channel: Channel, minutes: Int) = viewModelScope.launch {
        runCatching { user.startRecording(channel, minutes) }
            .onSuccess { mutableState.update { it.copy(message = "Recording started for ${channel.displayTitle}.") }; loadRecordings() }
            .onFailure { error -> mutableState.update { it.copy(message = error.readable()) } }
    }

    private var playbackJob: Job? = null

    fun play(channel: Channel, launch: PlaybackLaunch? = null) {
        if (playbackJob?.isActive == true) return
        val prepared = launch ?: PlaybackLaunch(
            title = channel.displayTitle,
            upstreamUrl = channel.url,
            contentKind = channel.contentType ?: if (channel.isLive) "live" else "movie",
            displayTitle = PlaybackLaunch.cleanMediaDisplayTitle(channel.displayTitle)
                .ifBlank { channel.displayTitle },
            releaseName = channel.name,
            durationSeconds = channel.duration?.toInt()?.takeIf { it > 0 },
        )
        playbackJob = viewModelScope.launch {
            mutableState.update { it.copy(message = "Preparing ${prepared.chromeTitle}…") }
            runCatching {
                channels.createStream(
                    StreamSessionRequest(
                        url = prepared.upstreamUrl,
                        title = prepared.chromeTitle,
                        logo = channel.artUrl,
                        group = channel.groupTitle,
                        meta = prepared.toMeta(),
                    ),
                )
            }.onSuccess { session ->
                mutableState.update { it.copy(message = null) }
                PlaybackHandoff.launch = prepared
                mutablePlayback.emit(
                    PlaybackRequest(
                        prepared.chromeTitle,
                        factory.session.serverUrl + "api/stream/proxy/${session.id}",
                        prepared.contentKind,
                        factory.session.accessToken,
                        factory.session.cookies,
                        prepared,
                    ),
                )
            }.onFailure { error -> mutableState.update { it.copy(message = error.readable()) } }
        }
    }

    fun setSearchOpen(open: Boolean) {
        searchJob?.cancel()
        mutableState.update { it.copy(searchOpen = open, searchResults = if (open) it.searchResults else emptyList()) }
    }

    fun search(query: String) {
        searchJob?.cancel()
        if (query.trim().length < 2) { mutableState.update { it.copy(searchResults = emptyList()) }; return }
        searchJob = viewModelScope.launch {
            delay(250)
            runCatching { search.search(query) }.onSuccess { results -> mutableState.update { it.copy(searchResults = results) } }
        }
    }

    fun setSettingsOpen(open: Boolean) = mutableState.update { it.copy(settingsOpen = open) }
    fun changeServer(url: String) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            mutableState.update { it.copy(message = "Server URL must begin with http:// or https://") }
            return
        }
        pairJob?.cancel()
        settings.changeServer(url)
        mutableState.value = ZendeUiState(serverUrl = settings.serverUrl())
        bootstrap()
    }
    fun dismissMessage() = mutableState.update { it.copy(message = null) }

    fun logout() = viewModelScope.launch {
        user.logout()
        mutableState.value = ZendeUiState(booting = false, auth = AuthState(true, null))
        beginPairing()
    }

    fun playRecording(recording: Recording) = viewModelScope.launch {
        PlaybackHandoff.launch = null
        mutablePlayback.emit(PlaybackRequest(recording.channelName, factory.session.serverUrl + "api/recordings/${recording.id}/play", "live", factory.session.accessToken, factory.session.cookies))
    }

    private fun MediaMetadata?.portalId(info: kotlinx.serialization.json.JsonObject?, kind: String): String? {
        val direct = if (kind == "imdb") this?.imdbId else this?.tmdbId
        direct?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        val source = info ?: return null
        val keys = if (kind == "imdb") listOf("imdb_id", "imdb", "imdbId") else listOf("tmdb_id", "tmdb", "tmdbId")
        for (key in keys) {
            val value = source[key]
            if (value is JsonPrimitive) {
                value.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
            }
        }
        return null
    }

    private fun Throwable.readable(): String = when (this) {
        is CancellationException -> throw this
        else -> message ?: "Something went wrong."
    }

    companion object {
        fun factory(context: Context) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = ZendeViewModel(context) as T
        }
    }
}

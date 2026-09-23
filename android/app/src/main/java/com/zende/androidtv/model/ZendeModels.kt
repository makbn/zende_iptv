package com.zende.androidtv.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String = "",
    val username: String = "",
    val role: String = "USER",
)

@Serializable
data class AuthState(
    val authEnabled: Boolean = false,
    val user: User? = null,
)

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class TokenResponse(
    val accessToken: String = "",
    val refreshToken: String = "",
    val user: User? = null,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class PairSession(
    val sessionId: String = "",
    val expiresAt: Long = 0,
    val verificationUri: String = "",
)

@Serializable
data class PairStatus(
    val status: String = "pending",
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val user: User? = null,
)

@Serializable
data class MediaMetadata(
    val title: String? = null,
    val backdropUrl: String? = null,
    val posterUrl: String? = null,
    val year: String? = null,
    val contentRating: String? = null,
    val overview: String? = null,
    val imdbId: String? = null,
    val tmdbId: String? = null,
)

@Serializable
data class HeroMetadataResponse(val metadata: MediaMetadata? = null)

@Serializable
data class Channel(
    val url: String = "",
    val name: String = "Untitled",
    val duration: Double? = null,
    val tvgId: String? = null,
    val tvgLogo: String? = null,
    val tvgLanguage: String? = null,
    val groupTitle: String? = null,
    val contentType: String? = null,
    val providerId: String? = null,
    val providerChannelId: String? = null,
    val description: String? = null,
    val imdbRating: Double? = null,
    val homeMetadata: MediaMetadata? = null,
    val positionSeconds: Double? = null,
    val playbackJson: String? = null,
    val lastOpenedAt: String? = null,
) {
    val displayTitle: String get() = homeMetadata?.title?.takeIf(String::isNotBlank) ?: name
    val artUrl: String? get() = homeMetadata?.backdropUrl ?: homeMetadata?.posterUrl ?: tvgLogo
    val posterUrl: String? get() = homeMetadata?.posterUrl ?: tvgLogo ?: homeMetadata?.backdropUrl
    val isLive: Boolean get() = contentType == "live" || (!url.contains("/movie/") && !url.contains("/series/") && !url.startsWith("zende://"))
    val isSeries: Boolean get() = contentType == "series" || url.startsWith("zende://series/")
    val isSeriesContainer: Boolean get() = url.startsWith("zende://series/")
    val subtitle: String get() = listOfNotNull(
        homeMetadata?.year?.takeIf(String::isNotBlank),
        imdbRating?.takeIf { it > 0 }?.let { "IMDb %.1f".format(it) },
        groupTitle?.takeIf(String::isNotBlank),
    ).take(2).joinToString("  •  ")
}

@Serializable
data class Shelf(val channels: List<Channel> = emptyList(), val total: Int = channels.size)

@Serializable
data class HomeShelves(
    val discover: Shelf = Shelf(),
    val movies: Shelf = Shelf(),
    val series: Shelf = Shelf(),
)

@Serializable
data class Facet(val key: String = "", val label: String = "", val count: Int = 0)

@Serializable
data class RatingFacet(val min: Double = 0.0, val count: Int = 0)

@Serializable
data class CatalogFacets(
    val categories: List<Facet> = emptyList(),
    val languages: List<Facet> = emptyList(),
    val countries: List<Facet> = emptyList(),
    val years: List<Facet> = emptyList(),
    val ratings: List<RatingFacet> = emptyList(),
)

@Serializable
data class CatalogResponse(
    val channels: List<Channel> = emptyList(),
    val total: Int = channels.size,
    val offset: Int = 0,
    val limit: Int = 0,
    val facets: CatalogFacets = CatalogFacets(),
)

@Serializable
data class FavoriteItem(
    val url: String = "",
    val name: String = "Untitled",
    val tvgId: String? = null,
    val tvgLogo: String? = null,
    val groupTitle: String? = null,
    val channel: Channel? = null,
) {
    fun asChannel() = channel ?: Channel(url = url, name = name, tvgId = tvgId, tvgLogo = tvgLogo, groupTitle = groupTitle)
}

@Serializable
data class FavoriteRequest(
    val url: String,
    val name: String,
    val tvgId: String? = null,
    val tvgLogo: String? = null,
    val groupTitle: String? = null,
)

@Serializable
data class GuideProgram(
    val title: String = "Programming",
    val description: String? = null,
    val startMs: Long = 0,
    val stopMs: Long = 0,
)

@Serializable
data class GuideRow(val channel: Channel = Channel(), val programmes: List<GuideProgram> = emptyList())

@Serializable
data class GuideResponse(val results: List<GuideRow> = emptyList())

@Serializable
data class PreferredGuideChannel(val providerId: String, val tvgId: String)

@Serializable
data class GuideRequest(
    val query: String = "",
    val preferred: List<PreferredGuideChannel> = emptyList(),
    val limit: Int = 48,
)

@Serializable
data class Recording(
    val id: String = "",
    val channelUrl: String? = null,
    val channelName: String = "Recording",
    val channelLogo: String? = null,
    val channelGroup: String? = null,
    val status: String = "",
    val startsAt: String? = null,
    val startedAt: String? = null,
    val endsAt: String? = null,
    val endedAt: String? = null,
    val plannedEndsAt: String? = null,
    val plannedSeconds: Int? = null,
    val sizeBytes: String? = null,
    val error: String? = null,
)

@Serializable
data class RecordingsOverview(
    val ffmpegAvailable: Boolean = true,
    val schedules: List<Recording> = emptyList(),
    val active: List<Recording> = emptyList(),
    val library: List<Recording> = emptyList(),
    val recentFailures: List<Recording> = emptyList(),
)

@Serializable
data class StartRecordingRequest(
    val channelUrl: String,
    val channelName: String,
    val channelLogo: String? = null,
    val channelGroup: String? = null,
    val durationMinutes: Int = 60,
)

@Serializable
data class PlaybackNeighborRef(
    val season: String = "",
    val episodeNum: String = "",
    val title: String = "",
    val watchId: String? = null,
    val playUrl: String? = null,
    val episodeIndex: Int = -1,
    val durationSeconds: Int? = null,
)

@Serializable
data class PlaybackIntroSegment(
    val startMs: Int = 0,
    val endMs: Int = 0,
)

@Serializable
data class StreamSessionMeta(
    val contentKind: String? = null,
    val displayTitle: String? = null,
    val displaySubtitle: String? = null,
    val durationSeconds: Int? = null,
    val seriesId: String? = null,
    val seriesTitle: String? = null,
    val season: String? = null,
    val episodeNum: String? = null,
    val episodeTitle: String? = null,
    val episodeIndex: Int? = null,
    val searchTitle: String? = null,
    val year: String? = null,
    val imdbId: String? = null,
    val tmdbId: String? = null,
    val intro: List<PlaybackIntroSegment>? = null,
    val hasPrevious: Boolean? = null,
    val hasNext: Boolean? = null,
    val previous: PlaybackNeighborRef? = null,
    val next: PlaybackNeighborRef? = null,
)

@Serializable
data class StreamSessionRequest(
    val url: String,
    val title: String,
    val logo: String? = null,
    val group: String? = null,
    val meta: StreamSessionMeta? = null,
)

@Serializable
data class SubtitleHit(
    val id: String = "",
    val url: String = "",
    val language: String = "",
    val languageName: String = "",
    val release: String = "",
    val hearingImpaired: Boolean = false,
)

@Serializable
data class SubtitleSearchResponse(
    val enabled: Boolean = false,
    val results: List<SubtitleHit> = emptyList(),
    val error: String? = null,
)

@Serializable
data class SubtitleLoadRequest(
    val url: String,
    val label: String,
    val language: String,
    val fileName: String? = null,
)

@Serializable
data class SubtitleLoadResponse(
    val trackId: String = "",
    val label: String = "",
    val language: String = "",
    val vttUrl: String = "",
)

@Serializable
data class IntroSegment(val startMs: Long = 0, val endMs: Long = 0)

@Serializable
data class IntroResponse(val segments: List<IntroSegment> = emptyList())

@Serializable
data class StreamSession(val id: String = "")

@Serializable
data class ApiOk(val ok: Boolean = false)

data class CatalogFilters(
    val type: String = "all",
    val query: String = "",
    val category: String? = null,
    val language: String? = null,
    val country: String? = null,
    val year: String? = null,
)

enum class Destination(val label: String) {
    Home("Home"), Library("Library"), Favorites("Favorites"), Discover("Discover"), Recordings("Recordings")
}

package com.zende.androidtv.ui.player

import com.zende.androidtv.model.StreamSessionMeta

data class PlaybackEpisodeRef(
    val season: String,
    val episodeNum: String,
    val title: String,
    val playUrl: String,
    val durationSeconds: Int? = null,
)

data class PlaybackLaunch(
    val title: String,
    val upstreamUrl: String,
    val contentKind: String,
    val imdbId: String? = null,
    val tmdbId: String? = null,
    val releaseName: String? = null,
    val year: String? = null,
    val season: String? = null,
    val episodeNum: String? = null,
    val seriesId: String? = null,
    val seriesTitle: String? = null,
    val episodeIndex: Int = -1,
    val durationSeconds: Int? = null,
    val episodes: List<PlaybackEpisodeRef> = emptyList(),
) {
    val isVod: Boolean get() = contentKind == "movie" || contentKind == "episode"

    fun toMeta(): StreamSessionMeta = StreamSessionMeta(
        contentKind = contentKind.takeIf { it == "live" || it == "movie" || it == "episode" },
        durationSeconds = durationSeconds?.takeIf { it > 0 },
        seriesId = seriesId?.takeIf { it.isNotBlank() },
        seriesTitle = seriesTitle?.takeIf { it.isNotBlank() },
        season = season?.takeIf { it.isNotBlank() },
        episodeNum = episodeNum?.takeIf { it.isNotBlank() },
        episodeTitle = title.takeIf { contentKind == "episode" && it.isNotBlank() },
        episodeIndex = episodeIndex.takeIf { it >= 0 },
        searchTitle = (seriesTitle ?: title).takeIf { it.isNotBlank() },
        year = year?.takeIf { it.isNotBlank() },
        imdbId = imdbId?.takeIf { it.isNotBlank() },
    )
}

object PlaybackHandoff {
    var launch: PlaybackLaunch? = null
}

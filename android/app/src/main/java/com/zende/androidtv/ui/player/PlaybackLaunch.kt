package com.zende.androidtv.ui.player

import com.zende.androidtv.model.PlaybackNeighborRef
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
    val displayTitle: String = "",
    val displaySubtitle: String? = null,
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
    val hasPrevious: Boolean = false,
    val hasNext: Boolean = false,
    val previous: PlaybackNeighborRef? = null,
    val next: PlaybackNeighborRef? = null,
    val episodes: List<PlaybackEpisodeRef> = emptyList(),
) {
    val isVod: Boolean get() = contentKind == "movie" || contentKind == "episode"

    val chromeTitle: String
        get() = displayTitle.ifBlank { cleanMediaDisplayTitle(title) }.ifBlank { title }

    fun toMeta(): StreamSessionMeta = StreamSessionMeta(
        contentKind = contentKind.takeIf { it == "live" || it == "movie" || it == "episode" },
        displayTitle = chromeTitle.takeIf { it.isNotBlank() },
        displaySubtitle = displaySubtitle?.takeIf { it.isNotBlank() },
        durationSeconds = durationSeconds?.takeIf { it > 0 },
        seriesId = seriesId?.takeIf { it.isNotBlank() },
        seriesTitle = seriesTitle?.takeIf { it.isNotBlank() }?.let(::cleanMediaDisplayTitle),
        season = season?.takeIf { it.isNotBlank() },
        episodeNum = episodeNum?.takeIf { it.isNotBlank() },
        episodeTitle = when {
            contentKind == "episode" -> cleanMediaDisplayTitle(title.substringAfterLast(" · ").ifBlank { title })
                .takeIf { it.isNotBlank() }
            else -> null
        },
        episodeIndex = episodeIndex.takeIf { it >= 0 },
        searchTitle = cleanMediaDisplayTitle(seriesTitle ?: title).takeIf { it.isNotBlank() },
        year = year?.takeIf { it.isNotBlank() },
        imdbId = imdbId?.takeIf { it.isNotBlank() },
        tmdbId = tmdbId?.takeIf { it.isNotBlank() },
        hasPrevious = hasPrevious,
        hasNext = hasNext,
        previous = previous,
        next = next,
    )

    companion object {
        fun cleanMediaDisplayTitle(raw: String?): String {
            if (raw.isNullOrBlank()) return ""
            var name = raw.trim()
            name = name.replace(Regex("""\s*\[[^\]]*\]"""), "").trim()
            name = name.replace(Regex("""\s*\(\s*\d{3,4}\s*p\s*\)""", RegexOption.IGNORE_CASE), "").trim()
            name = name.replace(Regex("""\s*\(\s*(4K|UHD)\s*\)""", RegexOption.IGNORE_CASE), "").trim()
            name = name.replace(Regex("""\s*\(\s*(19|20)\d{2}\s*\)"""), "").trim()
            name = name.replace(Regex("""^[#@]+"""), "").trim()
            name = name.replace(Regex("""\s+"""), " ").trim()
            return name.ifBlank { raw.trim() }
        }

        fun neighborFrom(episodes: List<PlaybackEpisodeRef>, index: Int): PlaybackNeighborRef? {
            val ep = episodes.getOrNull(index) ?: return null
            return PlaybackNeighborRef(
                season = ep.season,
                episodeNum = ep.episodeNum,
                title = cleanMediaDisplayTitle(ep.title).ifBlank { ep.title },
                playUrl = ep.playUrl,
                episodeIndex = index,
                durationSeconds = ep.durationSeconds,
            )
        }
    }
}

object PlaybackHandoff {
    var launch: PlaybackLaunch? = null
}

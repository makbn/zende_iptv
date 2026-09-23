package com.zende.androidtv.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class SeriesEpisode(
    val season: String = "0",
    val episodeNum: String = "",
    val title: String = "Episode",
    val playUrl: String = "",
    val durationSeconds: Int? = null,
    val artworkUrl: String? = null,
    val overview: String? = null,
    val airDate: String? = null,
    val rating: Double? = null,
) {
    val code: String get() = "S${season}E${episodeNum.ifBlank { "?" }}"
    val runtimeLabel: String? get() = durationSeconds?.takeIf { it > 0 }?.let { "${it / 60} min" }
}

@Serializable
data class SeriesInfo(
    val seriesId: String = "",
    val info: JsonObject = JsonObject(emptyMap()),
    val episodes: List<SeriesEpisode> = emptyList(),
    val metadata: MediaMetadata? = null,
)

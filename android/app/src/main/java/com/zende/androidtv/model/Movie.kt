package com.zende.androidtv.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

typealias Movie = Channel

@Serializable
data class MovieInfo(
    val vodId: String = "",
    val info: JsonObject = JsonObject(emptyMap()),
    val movieData: JsonObject? = null,
    val durationSeconds: Int? = null,
    val metadata: MediaMetadata? = null,
    val channel: Channel = Channel(),
)

@Serializable
data class InternalDownloadSettings(
    val configured: Boolean = false,
    val directoryPath: String? = null,
)

@Serializable
data class InternalDownloadRequest(val url: String, val title: String)

@Serializable
data class InternalDownloadResponse(
    val id: String = "",
    val fileName: String = "",
    val directoryPath: String = "",
)

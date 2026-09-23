package com.zende.androidtv.api

import com.zende.androidtv.model.IntroResponse
import com.zende.androidtv.model.StreamSession
import com.zende.androidtv.model.StreamSessionRequest
import com.zende.androidtv.model.SubtitleLoadRequest
import com.zende.androidtv.model.SubtitleLoadResponse
import com.zende.androidtv.model.SubtitleSearchResponse

class PlaybackApi(factory: ZendeApiFactory) : BaseApi(factory) {
    val serverUrl: String get() = factory.session.serverUrl
    val token: String? get() = factory.session.accessToken
    val cookies: String? get() = factory.session.cookies

    suspend fun open(request: StreamSessionRequest): StreamSession = execute { service.createStream(request) }

    suspend fun searchSubtitles(
        imdbId: String?,
        tmdbId: String?,
        season: Int?,
        episode: Int?,
        type: String,
        releaseFilter: String?,
    ): SubtitleSearchResponse = execute {
        service.searchSubtitles(imdbId, tmdbId, season, episode, type, releaseFilter)
    }

    suspend fun loadSubtitle(request: SubtitleLoadRequest): SubtitleLoadResponse =
        execute { service.loadSubtitle(request) }

    suspend fun intro(imdbId: String?, tmdbId: String?, season: Int?, episode: Int?): IntroResponse =
        execute { service.intro(imdbId, tmdbId, season, episode) }
}

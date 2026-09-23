package com.zende.androidtv.api

import com.zende.androidtv.model.Channel
import com.zende.androidtv.model.InternalDownloadRequest

class MovieApi(factory: ZendeApiFactory) : BaseApi(factory) {
    suspend fun details(movie: Channel) = execute {
        service.movieInfo(
            vodId = movie.providerChannelId?.let { "channel:$it" },
            url = movie.url,
            title = movie.displayTitle,
        )
    }

    suspend fun download(movie: Channel) = execute {
        service.startInternalDownload(InternalDownloadRequest(movie.url, movie.displayTitle))
    }

    suspend fun downloadSettings() = execute { service.internalDownloadSettings() }

    suspend fun play(movie: Channel) = execute {
        service.createStream(com.zende.androidtv.model.StreamSessionRequest(movie.url, movie.displayTitle, movie.artUrl, movie.groupTitle))
    }
}

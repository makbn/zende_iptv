package com.zende.androidtv.api

import com.zende.androidtv.model.Channel

class SeriesApi(factory: ZendeApiFactory) : BaseApi(factory) {
    suspend fun details(series: Channel) = execute {
        service.seriesInfo(
            url = series.url,
            tvgId = series.tvgId,
            channelId = series.providerChannelId,
            title = series.displayTitle,
        )
    }
}

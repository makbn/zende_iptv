package com.zende.androidtv.api

import com.zende.androidtv.model.CatalogFilters
import com.zende.androidtv.model.GuideRequest
import com.zende.androidtv.model.PreferredGuideChannel
import com.zende.androidtv.model.StreamSessionRequest

class ChannelApi(factory: ZendeApiFactory) : BaseApi(factory) {
    suspend fun home() = execute { service.homeShelves() }
    suspend fun heroMetadata(channel: com.zende.androidtv.model.Channel) = execute {
        service.heroMetadata(channel.displayTitle, if (channel.isSeries) "tv" else "movie", channel.providerChannelId, channel.homeMetadata?.year).metadata
    }
    suspend fun catalog(filters: CatalogFilters = CatalogFilters(), offset: Int = 0) = execute {
        service.catalog(filters.type, filters.query.takeIf(String::isNotBlank), filters.category, filters.language, filters.country, filters.year, offset = offset)
    }
    suspend fun guide(query: String = "", preferred: List<PreferredGuideChannel> = emptyList()) = execute {
        service.guide(GuideRequest(query = query, preferred = preferred))
    }
    suspend fun createStream(channel: com.zende.androidtv.model.Channel) = execute {
        service.createStream(StreamSessionRequest(channel.url, channel.displayTitle, channel.artUrl, channel.groupTitle))
    }
}

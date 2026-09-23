package com.zende.androidtv.api

class SearchApi(factory: ZendeApiFactory) : BaseApi(factory) {
    suspend fun search(query: String) = execute { service.catalog("all", query = query.trim(), limit = 60).channels }
}

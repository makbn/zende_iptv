package com.zende.androidtv.api

class SettingsApi(private val apiFactory: ZendeApiFactory) : BaseApi(apiFactory) {
    suspend fun providers() = execute { service.providers() }
    fun serverUrl() = apiFactory.session.serverUrl
    fun changeServer(url: String) = apiFactory.changeServer(url)
}

package com.zende.androidtv.api

import com.zende.androidtv.model.Channel
import com.zende.androidtv.model.FavoriteRequest
import com.zende.androidtv.model.LoginRequest
import com.zende.androidtv.model.StartRecordingRequest

class UserApi(private val apiFactory: ZendeApiFactory) : BaseApi(apiFactory) {
    suspend fun authState() = execute { service.authState() }
    suspend fun login(username: String, password: String) = execute {
        service.login(LoginRequest(username.trim(), password)).also(apiFactory.session::save)
    }
    suspend fun createPair() = execute { service.createPair() }
    suspend fun pairStatus(sessionId: String) = execute { service.pairStatus(sessionId) }
    fun savePairTokens(status: com.zende.androidtv.model.PairStatus) {
        val access = status.accessToken ?: return
        val refresh = status.refreshToken ?: return
        apiFactory.session.save(com.zende.androidtv.model.TokenResponse(access, refresh, status.user))
    }
    suspend fun history() = execute { service.history() }
    suspend fun favorites() = execute { service.favorites() }.map { it.asChannel() }
    suspend fun addFavorite(channel: Channel) = execute {
        service.addFavorite(FavoriteRequest(channel.url, channel.displayTitle, channel.tvgId, channel.artUrl, channel.groupTitle))
    }
    suspend fun removeFavorite(channel: Channel) = execute { service.removeFavorite(channel.url) }
    suspend fun recordings() = execute { service.recordings() }
    suspend fun startRecording(channel: Channel, minutes: Int) = execute {
        service.startRecording(StartRecordingRequest(channel.url, channel.displayTitle, channel.artUrl, channel.groupTitle, minutes))
    }
    suspend fun logout() {
        runCatching { service.logout() }
        apiFactory.session.clear()
    }
}

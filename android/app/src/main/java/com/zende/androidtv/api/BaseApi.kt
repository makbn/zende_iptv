package com.zende.androidtv.api

import android.content.Context
import com.zende.androidtv.BuildConfig
import com.zende.androidtv.model.ApiOk
import com.zende.androidtv.model.AuthState
import com.zende.androidtv.model.CatalogResponse
import com.zende.androidtv.model.Channel
import com.zende.androidtv.model.FavoriteItem
import com.zende.androidtv.model.FavoriteRequest
import com.zende.androidtv.model.GuideRequest
import com.zende.androidtv.model.GuideResponse
import com.zende.androidtv.model.HomeShelves
import com.zende.androidtv.model.HeroMetadataResponse
import com.zende.androidtv.model.LoginRequest
import com.zende.androidtv.model.MovieInfo
import com.zende.androidtv.model.InternalDownloadRequest
import com.zende.androidtv.model.InternalDownloadResponse
import com.zende.androidtv.model.InternalDownloadSettings
import com.zende.androidtv.model.PairSession
import com.zende.androidtv.model.PairStatus
import com.zende.androidtv.model.RecordingsOverview
import com.zende.androidtv.model.RefreshRequest
import com.zende.androidtv.model.StartRecordingRequest
import com.zende.androidtv.model.SeriesInfo
import com.zende.androidtv.model.IntroResponse
import com.zende.androidtv.model.StreamSession
import com.zende.androidtv.model.StreamSessionRequest
import com.zende.androidtv.model.SubtitleLoadRequest
import com.zende.androidtv.model.SubtitleLoadResponse
import com.zende.androidtv.model.SubtitleSearchResponse
import com.zende.androidtv.model.TokenResponse
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

class SessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("zende_tv_session", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = preferences.getString("server_url", null)?.trim().orEmpty()
            .ifEmpty { BuildConfig.ZENDE_URL }
            .trimEnd('/') + "/"
        set(value) { preferences.edit().putString("server_url", value.trim().trimEnd('/') + "/").apply() }

    var accessToken: String?
        get() = preferences.getString("access_token", null)
        set(value) { preferences.edit().putString("access_token", value).apply() }

    var refreshToken: String?
        get() = preferences.getString("refresh_token", null)
        set(value) { preferences.edit().putString("refresh_token", value).apply() }

    var cookies: String?
        get() = preferences.getString("cookies", null)
        set(value) { preferences.edit().putString("cookies", value).apply() }

    fun save(response: TokenResponse) {
        accessToken = response.accessToken
        refreshToken = response.refreshToken
    }

    fun clear() {
        preferences.edit().remove("access_token").remove("refresh_token").remove("cookies").apply()
    }
}

class ApiException(val status: Int, override val message: String) : IOException(message)

private class SessionInterceptor(private val session: SessionStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
            .header("Accept", "application/json")
            .header("X-Zende-Client", "android-tv")
        session.accessToken?.takeIf(String::isNotBlank)?.let { builder.header("Authorization", "Bearer $it") }
        session.cookies?.takeIf(String::isNotBlank)?.let { builder.header("Cookie", it) }
        val response = chain.proceed(builder.build())
        response.headers("Set-Cookie").takeIf(List<String>::isNotEmpty)?.let { values ->
            session.cookies = values.joinToString("; ") { it.substringBefore(';') }
        }
        return response
    }
}

/** Retries only requests that are safe to repeat, with bounded exponential backoff. */
private class RetryInterceptor(private val maxRetries: Int = 2) : Interceptor {
    private val retryCodes = setOf(408, 425, 429, 500, 502, 503, 504)
    private val idempotent = setOf("GET", "HEAD", "OPTIONS", "DELETE")

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var attempt = 0
        var lastFailure: IOException? = null
        while (attempt <= maxRetries) {
            try {
                val response = chain.proceed(request)
                if (response.code !in retryCodes || request.method !in idempotent || attempt == maxRetries) return response
                val retryAfterMs = response.header("Retry-After")?.toLongOrNull()?.times(1_000)
                response.close()
                Thread.sleep((retryAfterMs ?: (250L shl attempt)).coerceAtMost(2_000L))
            } catch (error: IOException) {
                lastFailure = error
                if (request.method !in idempotent || attempt == maxRetries) throw error
                Thread.sleep((250L shl attempt).coerceAtMost(2_000L))
            }
            attempt++
        }
        throw lastFailure ?: IOException("Request failed after retries")
    }
}

private class TokenAuthenticator(
    private val session: SessionStore,
    private val json: Json,
) : Authenticator {
    private val refreshClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) > 1) return null
        val refreshToken = session.refreshToken ?: return null
        val payload = json.encodeToString(RefreshRequest(refreshToken))
        val refreshRequest = Request.Builder()
            .url(session.serverUrl + "api/auth/refresh")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        return runCatching {
            refreshClient.newCall(refreshRequest).execute().use { refreshResponse ->
                if (!refreshResponse.isSuccessful) return null
                val tokens = json.decodeFromString<TokenResponse>(refreshResponse.body?.string().orEmpty())
                session.save(tokens)
                response.request.newBuilder().header("Authorization", "Bearer ${tokens.accessToken}").build()
            }
        }.getOrNull()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var current = response.priorResponse
        while (current != null) { count++; current = current.priorResponse }
        return count
    }
}

interface ZendeService {
    @GET("api/auth/me") suspend fun authState(): AuthState
    @POST("api/auth/login") suspend fun login(@Body request: LoginRequest): TokenResponse
    @POST("api/auth/login/pair") suspend fun createPair(): PairSession
    @GET("api/auth/login/pair/{sessionId}") suspend fun pairStatus(@Path("sessionId") sessionId: String): PairStatus
    @POST("api/auth/logout") suspend fun logout(): ApiOk

    @GET("api/library/home-shelves") suspend fun homeShelves(): HomeShelves
    @GET("api/library/hero-metadata") suspend fun heroMetadata(
        @Query("title") title: String,
        @Query("mediaType") mediaType: String,
        @Query("channelId") channelId: String? = null,
        @Query("year") year: String? = null,
    ): HeroMetadataResponse
    @GET("api/library/catalog") suspend fun catalog(
        @Query("contentType") type: String,
        @Query("q") query: String? = null,
        @Query("category") category: String? = null,
        @Query("language") language: String? = null,
        @Query("country") country: String? = null,
        @Query("year") year: String? = null,
        @Query("limit") limit: Int = 120,
        @Query("offset") offset: Int = 0,
    ): CatalogResponse
    @GET("api/channels/search") suspend fun search(@Query("q") query: String, @Query("limit") limit: Int = 60): List<Channel>
    @GET("api/xtream/series-info") suspend fun seriesInfo(
        @Query("url") url: String,
        @Query("tvgId") tvgId: String? = null,
        @Query("channelId") channelId: String? = null,
        @Query("title") title: String? = null,
    ): SeriesInfo
    @GET("api/xtream/vod-info") suspend fun movieInfo(
        @Query("vodId") vodId: String? = null,
        @Query("url") url: String? = null,
        @Query("title") title: String? = null,
    ): MovieInfo
    @GET("api/settings/internal-downloads") suspend fun internalDownloadSettings(): InternalDownloadSettings
    @POST("api/internal-downloads") suspend fun startInternalDownload(@Body request: InternalDownloadRequest): InternalDownloadResponse
    @POST("api/epg/guide") suspend fun guide(@Body request: GuideRequest): GuideResponse

    @GET("api/user/history") suspend fun history(@Query("sort") sort: String = "recent"): List<Channel>
    @GET("api/user/favorites") suspend fun favorites(@Query("enrich") enrich: Int = 1): List<FavoriteItem>
    @POST("api/user/favorites") suspend fun addFavorite(@Body request: FavoriteRequest): ApiOk
    @DELETE("api/user/favorites") suspend fun removeFavorite(@Query("url") url: String): ApiOk

    @GET("api/recordings/overview") suspend fun recordings(): RecordingsOverview
    @POST("api/recordings/start") suspend fun startRecording(@Body request: StartRecordingRequest): JsonObject
    @POST("api/stream/session") suspend fun createStream(@Body request: StreamSessionRequest): StreamSession
    @GET("api/subtitles/search") suspend fun searchSubtitles(
        @Query("imdbId") imdbId: String? = null,
        @Query("tmdbId") tmdbId: String? = null,
        @Query("season") season: Int? = null,
        @Query("episode") episode: Int? = null,
        @Query("type") type: String? = null,
        @Query("releaseFilter") releaseFilter: String? = null,
    ): SubtitleSearchResponse
    @POST("api/subtitles/load") suspend fun loadSubtitle(@Body request: SubtitleLoadRequest): SubtitleLoadResponse
    @GET("api/media/intro") suspend fun intro(
        @Query("imdbId") imdbId: String? = null,
        @Query("tmdbId") tmdbId: String? = null,
        @Query("season") season: Int? = null,
        @Query("episode") episode: Int? = null,
    ): IntroResponse
    @GET("api/providers") suspend fun providers(): JsonObject
}

class ZendeApiFactory(context: Context) {
    val session = SessionStore(context.applicationContext)
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    @Volatile private var serviceCache: ZendeService? = null
    val service: ZendeService get() = serviceCache ?: synchronized(this) {
        serviceCache ?: createService().also { serviceCache = it }
    }

    fun changeServer(url: String) {
        session.serverUrl = url
        session.clear()
        serviceCache = null
    }

    private fun createService(): ZendeService {
        val logger = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(35, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(SessionInterceptor(session))
            .addInterceptor(RetryInterceptor())
            .addInterceptor(logger)
            .authenticator(TokenAuthenticator(session, json))
            .build()
        return Retrofit.Builder()
            .baseUrl(session.serverUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ZendeService::class.java)
    }
}

open class BaseApi(protected val factory: ZendeApiFactory) {
    protected val service: ZendeService get() = factory.service

    protected suspend fun <T> execute(block: suspend () -> T): T = try {
        block()
    } catch (error: HttpException) {
        val message = runCatching {
            val body = error.response()?.errorBody()?.string().orEmpty()
            factory.json.parseToJsonElement(body).jsonObject["error"]?.jsonPrimitive?.content
        }.getOrNull() ?: "The Zende server returned ${error.code()}."
        throw ApiException(error.code(), message)
    } catch (error: IOException) {
        throw ApiException(0, error.message ?: "The Zende server could not be reached.")
    }
}

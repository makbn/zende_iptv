package com.zende.androidtv.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil3.ImageLoader
import coil3.compose.AsyncImage
import coil3.compose.setSingletonImageLoaderFactory
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.CachePolicy
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.request.crossfade
import coil3.size.Precision
import okio.Path.Companion.toOkioPath

/** TV image loader. Hardware bitmaps render blank the second time a row is composed. */
@Composable
fun InstallZendeImageLoader() {
    setSingletonImageLoaderFactory { context -> zendeImageLoader(context) }
}

fun zendeImageLoader(context: Context): ImageLoader = ImageLoader.Builder(context)
    .components { add(OkHttpNetworkFetcherFactory()) }
    .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.25).build() }
    .diskCache {
        DiskCache.Builder()
            .directory(context.cacheDir.resolve("zende-images").toOkioPath())
            .maxSizePercent(0.04)
            .build()
    }
    .memoryCachePolicy(CachePolicy.ENABLED)
    .diskCachePolicy(CachePolicy.ENABLED)
    .build()

@Composable
fun ZendeImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val context = LocalContext.current
    val model = remember(url) {
        val target = url?.trim()?.takeIf { it.isNotEmpty() }
        ImageRequest.Builder(context)
            .data(target)
            .memoryCacheKey(target)
            .diskCacheKey(target)
            .memoryCachePolicy(CachePolicy.ENABLED)
            .diskCachePolicy(CachePolicy.ENABLED)
            .size(720, 405)
            .precision(Precision.INEXACT)
            .allowHardware(false)
            .crossfade(false)
            .build()
    }
    AsyncImage(
        model = model,
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
    )
}

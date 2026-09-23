plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val dotenv = rootProject.file(".env").takeIf { it.isFile }?.readLines()
    ?.mapNotNull { line ->
        line.trim().takeIf { it.isNotEmpty() && !it.startsWith("#") }
            ?.split("=", limit = 2)
            ?.takeIf { it.size == 2 }
            ?.let { (key, value) -> key.trim() to value.trim().trim('"', '\'') }
    }?.toMap().orEmpty()

fun endpoint(property: String, environment: String, dotenvKey: String, fallback: String): String =
    providers.gradleProperty("zendeUrl").orNull
        ?: providers.gradleProperty(property).orNull
        ?: System.getenv(environment)?.trim()?.takeIf { it.isNotEmpty() }
        ?: dotenv[dotenvKey]?.takeIf { it.isNotEmpty() }
        ?: fallback

fun quoted(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val emulatorZendeUrl = endpoint(
    property = "zendeEmulatorUrl",
    environment = "ZENDE_EMULATOR_URL",
    dotenvKey = "ZENDE_EMULATOR_URL",
    fallback = "http://10.0.2.2:8077",
)
val tvZendeUrl = endpoint(
    property = "zendeTvUrl",
    environment = "ZENDE_TV_URL",
    dotenvKey = "ZENDE_TV_URL",
    fallback = "https://live.makbn.com",
)

android {
    namespace = "com.zende.androidtv"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.zende.androidtv"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
    }

    flavorDimensions += "target"
    productFlavors {
        create("emulator") {
            dimension = "target"
            buildConfigField("String", "ZENDE_URL", quoted(emulatorZendeUrl))
        }
        create("tv") {
            dimension = "target"
            buildConfigField("String", "ZENDE_URL", quoted(tvZendeUrl))
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.08.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.tv:tv-material:1.1.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:3.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("io.coil-kt.coil3:coil-compose:3.6.2")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.6.2")
    implementation("com.google.zxing:core:3.5.4")

    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.11.1")
    implementation("androidx.media3:media3-ui:1.11.1")
}

tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.addAll(listOf("-Xlint:deprecation", "-Xlint:unchecked"))
}

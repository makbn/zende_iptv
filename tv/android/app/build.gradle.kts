plugins {
    id("com.android.application")
}

val configuredZendeUrl = providers.gradleProperty("zendeUrl")
    .orElse("http://10.0.2.2:8077")
val escapedZendeUrl = configuredZendeUrl.map {
    it.replace("\\", "\\\\").replace("\"", "\\\"")
}

android {
    namespace = "com.zende.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.zende.tv"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "ZENDE_URL", "\"${escapedZendeUrl.get()}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.13.0")
}

tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.add("-Xlint:deprecation")
}

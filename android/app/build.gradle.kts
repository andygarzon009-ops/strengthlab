plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.strengthlab.health"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.strengthlab.health"
        minSdk = 28            // Health Connect needs 26+; background read is reliable on 28+
        targetSdk = 35         // Android 15
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    // Point this at the deployed web app; override per build type if needed.
    buildFeatures { buildConfig = true }
    defaultConfig {
        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"https://strengthlab-henna.vercel.app\"",
        )
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    // Health Connect — pin to the latest stable 1.1.x (background read + new Metadata factories)
    implementation("androidx.health.connect:connect-client:1.1.0-rc02")

    // Background work
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Token persistence
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Activity result APIs / lifecycle
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
}

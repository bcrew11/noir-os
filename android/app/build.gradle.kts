plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.noir.launcher"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.noir.launcher"
        minSdk = 28 // Android TV 9+ (Google TV sticks/boxes)
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Stable signing key (see ../signing.properties) so new builds install as updates over old ones.
val signingProps = Properties().apply {
    val f = rootProject.file("signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
// versionCode must increase with every release; CI/scripts pass -PnoirVersionCode / -PnoirVersionName.
val noirVersionCode = (findProperty("noirVersionCode") as String?)?.toInt() ?: 2
val noirVersionName = (findProperty("noirVersionName") as String?) ?: "0.2.0"

android {
    namespace = "app.noir.launcher"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.noir.launcher"
        minSdk = 28 // Android TV 9+ (Google TV sticks/boxes)
        targetSdk = 35
        versionCode = noirVersionCode
        versionName = noirVersionName
    }
    signingConfigs {
        create("noir") {
            if (signingProps.isNotEmpty()) {
                storeFile = rootProject.file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        // Both build types use the permanent NOIR key, so any build can update an installed NOIR.
        getByName("debug") { signingConfig = signingConfigs.getByName("noir") }
        getByName("release") { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("noir") }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

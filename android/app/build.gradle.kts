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
// Version + update source live in ../noir.properties (bumped by scripts/release-android.sh).
val noirProps = Properties().apply { rootProject.file("noir.properties").inputStream().use { load(it) } }
val noirVersionCode = noirProps.getProperty("versionCode").toInt()
val noirVersionName: String = noirProps.getProperty("versionName")
val noirUpdateRepo: String = noirProps.getProperty("updateRepo", "").trim()
val noirUpdateBranch: String = noirProps.getProperty("updateBranch", "updates").trim()
// Releases are published to a dedicated branch of the (public) repo and served by GitHub's raw file host.
val noirUpdateUrl = if (noirUpdateRepo.isEmpty()) "" else "https://raw.githubusercontent.com/$noirUpdateRepo/$noirUpdateBranch/noir-update.json"

android {
    namespace = "app.noir.launcher"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.noir.launcher"
        minSdk = 28 // Android TV 9+ (Google TV sticks/boxes)
        targetSdk = 35
        versionCode = noirVersionCode
        versionName = noirVersionName
        buildConfigField("String", "UPDATE_URL", "\"$noirUpdateUrl\"")
    }
    buildFeatures { buildConfig = true }
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

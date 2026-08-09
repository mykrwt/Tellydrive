import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

// ---------------------------------------------------------------------------
// Telegram API credentials
// ---------------------------------------------------------------------------
// Source of truth: android/secrets.properties (git-ignored). It is created
// locally by the developer, or by Codemagic from the "tellybase_secrets"
// secret group (TELEGRAM_API_ID / TELEGRAM_API_HASH).
//
// We only fall back to the process environment variables when the file is
// absent. The values are compiled into BuildConfig and read on the native
// side (TelegramPlugin.kt). No secret values are ever printed here — only
// whether each key was resolved ("loaded: yes/no").
val secretsProperties = Properties()
val secretsFile = rootProject.file("secrets.properties")

if (secretsFile.exists()) {
    secretsProperties.load(FileInputStream(secretsFile))
}

/**
 * Resolves a secret from android/secrets.properties first, then from the
 * process environment, otherwise returns the provided safe default.
 */
fun resolveSecret(propertyKey: String, envVar: String, default: String): String {
    val fromFile = secretsProperties.getProperty(propertyKey)?.trim()
    if (!fromFile.isNullOrEmpty()) {
        return fromFile
    }
    val fromEnv = System.getenv(envVar)?.trim()
    if (!fromEnv.isNullOrEmpty()) {
        return fromEnv
    }
    return default
}

val telegramApiId = resolveSecret("TELEGRAM_API_ID", "TELEGRAM_API_ID", "0")
val telegramApiHash = resolveSecret("TELEGRAM_API_HASH", "TELEGRAM_API_HASH", "")

// Safe diagnostics — presence only, never the secret values.
val apiIdPresent = telegramApiId.trim().toIntOrNull()?.let { it > 0 } ?: false
val apiHashPresent = telegramApiHash.isNotBlank()
logger.lifecycle("TELEGRAM_API_ID loaded: ${if (apiIdPresent) "yes" else "no"}")
logger.lifecycle("TELEGRAM_API_HASH loaded: ${if (apiHashPresent) "yes" else "no"}")

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")

if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
android {
    namespace = "dev.aliabdollahzadeh.teledrive"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    defaultConfig {
        applicationId = "dev.aliabdollahzadeh.teledrive"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        buildConfigField(
            "int",
            "TELEGRAM_API_ID",
            telegramApiId
        )

        buildConfigField(
            "String",
            "TELEGRAM_API_HASH",
            "\"${telegramApiHash.replace("\\", "\\\\").replace("\"", "\\\"")}\""
        )

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDirs("src/main/jniLibs")
        }
    }

    if (keystorePropertiesFile.exists()) {
        signingConfigs {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // Native libraries are left uncompressed by default for App Bundles, 
    // which is the recommended approach for Play Store.
}

flutter {
    source = "../.."
}

repositories {
    google()
    mavenCentral()
    maven { url = uri("https://jitpack.io") }
}

dependencies {
    implementation("com.github.tdlibx:td:1.8.56")
}
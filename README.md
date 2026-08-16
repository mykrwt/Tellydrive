# TeleDrive — Gallery & Files

A modern Android Flutter application that turns Telegram into a personal storage layer through native TDLib integration.

TeleDrive provides a unified interface for managing photos, videos, documents, folders, backups, downloads, and Telegram-backed files — without relying on S3, Firebase, Google Drive, Dropbox, or another secondary cloud-storage backend.

---

## Features

### Gallery

A fast, gallery-first experience for your Telegram media.

* Date-grouped photo and video grid
* Smooth continuous pinch-to-zoom
* Adjustable grid density from **2–8 columns**
* Full-screen photo and video viewer
* Multi-selection
* Delete, download, and share
* Automatic filtering of internal storage data

Gallery displays only user-facing media. Internal chunk and manifest documents are hidden at the repository layer and therefore never appear in Gallery, Files, search, or FTP listings.

### Files

A complete file manager for Telegram-backed storage.

* Saved Messages and private Telegram channels
* Folder navigation
* Search and sorting
* List and grid layouts
* File thumbnails and type icons
* Multi-select
* Rename
* Delete
* Move
* Copy
* Download
* Share
* Upload
* Create private storage folders/channels

The Files section represents the underlying Telegram storage directly while hiding internal implementation files.

### Settings

Centralized controls for the entire application:

* Account
* Auto Backup
* Downloads & Storage
* Gallery
* Files
* Notifications
* Privacy & Security
* Biometric App Lock
* Local FTP Access
* Appearance
* Application Information

---

# Auto Backup

Auto Backup allows local Android folders to be continuously mapped to specific Telegram storage destinations.

Each backup rule connects:

**Local folder → Telegram destination**

Destinations can be Saved Messages or a private Telegram channel.

Rules can be:

* Added
* Edited
* Enabled/disabled
* Removed independently

### Backup behaviour

The monitor checks every enabled rule according to its configured frequency and whenever the application returns to the foreground.

Previously uploaded files are detected using:

* File path
* File size
* Last modified time

Already processed files are skipped, preventing unnecessary re-uploads.

Uploads use the same resumable chunked-upload system as normal uploads while preserving the original filename.

Upload progress is displayed through the application's upload interface.

### Backup constraints

Each rule can respect:

* Wi-Fi only
* Mobile data allowed
* Charging only

Backup status displays:

* Last backup time
* Pending files
* Last error
* Current activity

Android notifications can optionally be sent when a backup completes or fails.

### Folder permissions

Folder selection uses Android's system directory picker.

If Android prevents TeleDrive from accessing a selected directory, the application reports the problem clearly instead of silently failing.

Reliable background monitoring depends on Android battery-optimization settings. The onboarding flow guides the user through granting the required exemption.

---

# First-Run Setup

Before entering the application for the first time, TeleDrive verifies the required Android permissions.

The onboarding flow includes:

1. Notification permission
2. Battery-optimization exemption

Every step checks the **actual system permission state**.

Returning from Android Settings without granting the required permission does not bypass onboarding. Permission states are checked again whenever the application resumes.

---

# Telegram & TDLib Architecture

TeleDrive communicates with native Android code through Flutter method and event channels.

The native `TeleManager` layer handles the Telegram integration and provides:

* Phone-number authentication
* Login-code verification
* Two-factor authentication
* Persistent TDLib sessions
* Saved Messages discovery
* Writable channel discovery
* Telegram message history
* Media metadata
* File uploads
* Upload progress events
* On-demand downloads
* File deletion
* Private-channel creation
* Channel renaming and removal
* Thumbnail downloads
* TDLib cache management

Flutter communicates with this native layer through `TelegramPlugin`.

Telegram API credentials are supplied to the Android build through `BuildConfig`. They are not exposed through the Flutter UI and should never be committed to the repository.

### Local development credentials

Create:

`android/secrets.properties`

```properties
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_api_hash
```

For CI builds, the same credentials can be provided through environment variables:

```text
TELEGRAM_API_ID
TELEGRAM_API_HASH
```

The following sensitive files remain outside Git:

* `android/secrets.properties`
* Keystores
* Signing properties

---

# Large & Resumable Files

Telegram-supported files are uploaded directly without splitting.

For files larger than the direct-upload limit, TeleDrive automatically creates sequential parts of approximately **1900 MiB**.

Each part is stored as an internal Telegram document.

### Part metadata

Every part records:

* Upload UUID
* Original filename
* Original file size
* MIME type
* Total part count
* Zero-based part index

Once every part has been uploaded, a JSON manifest commits the virtual file.

The application persists completed-part state after every successful upload.

If an upload is interrupted, retrying the same source resumes from the first missing or failed part instead of restarting the entire upload.

### Downloads

Large files are reconstructed on demand.

TeleDrive:

1. Downloads the required parts
2. Streams them into a single output file
3. Reconstructs the original file
4. Verifies the resulting byte count against the manifest

The rest of the application sees the reconstructed result as a normal file.

This means Gallery and Files do not need to understand the underlying multipart implementation.

---

# Local FTP Server

TeleDrive includes an optional FTP server for accessing Telegram-backed storage from devices on the same local network.

The FTP settings allow configuration of:

* Username
* Encrypted password
* Port
* Server state

The application displays the current host and port while the server is running.

### FTP filesystem

The FTP root mirrors the same repository used by Files.

Root directories represent:

* Saved Messages
* Writable Telegram channels

Supported operations include:

* `LIST`
* `MLSD`
* `RETR`
* `STOR`
* `DELE`
* `MKD`
* `RMD`
* `RNFR`
* `RNTO`

Only user-facing Telegram files are exposed.

Internal chunks and manifest documents remain hidden.

### Storage behaviour

The FTP server does **not** maintain a permanent local copy of Telegram storage.

Individual transfers may temporarily use application/TDLib cache while a file is being downloaded or uploaded.

The FTP server automatically stops when its provider or application process is disposed.

> **Security:** FTP is unencrypted. Only enable it on a trusted local network.

---

# Build

## Requirements

* Flutter stable
* Android SDK
* Java 17
* Telegram API credentials

Telegram API credentials can be obtained through [my.telegram.org](https://my.telegram.org?utm_source=chatgpt.com).

## Install dependencies

```bash
flutter pub get
```

## Run tests

```bash
flutter test
```

## Build release APK

```bash
flutter build apk --release
```

### Release signing

If no release keystore is configured, Android uses its normal development-compatible signing behaviour.

For production releases, create:

`android/key.properties`

with the standard:

```properties
storeFile=...
storePassword=...
keyAlias=...
keyPassword=...
```

`codemagic.yaml` remains the CI build entry point.

---

# Security

TeleDrive keeps sensitive Telegram credentials outside the Flutter layer.

API credentials should:

* Never be hard-coded into Dart source
* Never be committed to Git
* Never be exposed through application UI
* Be supplied through local secret files or CI environment variables

The FTP server should only be enabled on networks you trust because standard FTP does not provide transport encryption.

---

# Platform Support

TeleDrive currently targets **Android**.

The existing native TDLib bridge is Android-specific. Supporting iOS with the same architecture would require a separate native iOS TDLib implementation.

---

## Architecture at a Glance

```text
┌───────────────────────────────┐
│          Flutter UI           │
│                               │
│  Gallery │ Files │ Settings   │
└───────────────┬───────────────┘
                │
        Method / Event Channels
                │
┌───────────────▼───────────────┐
│        TelegramPlugin         │
├───────────────────────────────┤
│         TeleManager           │
├───────────────────────────────┤
│            TDLib              │
├───────────────────────────────┤
│           Telegram            │
└───────────────────────────────┘
```

The repository layer presents Telegram storage as a normal file system while transparently handling authentication, caching, uploads, downloads, multipart files, manifests, and internal storage metadata.

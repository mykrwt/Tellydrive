# TeleDrive Gallery & Files

An Android Flutter application that uses a Telegram account as its storage layer. This project is built directly on the native TDLib architecture from [`ali-abdollahzadeh/teledrive`](https://github.com/ali-abdollahzadeh/teledrive): the existing authentication, persistent TDLib session, Saved Messages/channel discovery, upload, download, deletion, and cache behavior remain the backend foundation.

No S3, Firebase, Google Drive, Dropbox, or secondary cloud-storage backend is used.

## Application structure

The authenticated app has exactly three bottom destinations:

- **Gallery** — date-grouped Telegram image/video grid with smooth, continuous pinch-to-zoom (2–8 columns), full-screen photo/video viewer; selection, deletion, download, and sharing.
- **Files** — Telegram storage folders and their real files only; integrated search/sort, list/grid modes, thumbnails/type icons, multi-select, rename, delete, move, copy, download, share, upload, and private-channel folder creation.
- **Settings** — account, Auto Backup, downloads & storage, gallery, files, notifications, privacy & security (biometric app lock), local FTP access, appearance, and app information.

Internal chunk and manifest documents are filtered in the repository layer, so they cannot appear in Gallery, Files, search, or FTP listings.

## Auto Backup

Settings → Auto Backup maps local phone folders to specific Telegram destinations. Each rule pairs a watched folder with a drive folder (Saved Messages or a channel), and new files in that folder are uploaded to its destination on a schedule. Rules can be added, edited, enabled/disabled, and removed independently.

Behaviour:

- A monitor scans every enabled rule's folder on a configurable frequency and when the app returns to the foreground; files already backed up (fingerprinted by path + size + modified time) are skipped, so nothing is re-uploaded.
- Each upload reuses the existing resumable chunked upload pipeline and preserves the original filename; progress appears in the upload strip.
- Constraints are enforced before and during a pass: Wi-Fi only, allow mobile data, and charging only.
- Status (last backup time, pending count, last error) is shown in Settings and on the Auto Backup screen.
- Completion and failure optionally post an Android notification.

Folder access uses Android's directory picker. Folders the OS does not allow the app to read are reported with a clear message rather than failing silently. True background scanning relies on the in-app monitor plus foreground resume; reliable background operation requires the battery-optimization exemption granted during onboarding.

## Onboarding permissions

Before entering the app for the first time, the user must grant notification permission and disable battery optimization for TeleDrive. Each step verifies the real permission state and re-checks on resume, so simply opening system settings is not enough to proceed.


## Telegram and TDLib

Flutter talks to `TelegramPlugin` through method/event channels. `TeleManager` uses the upstream `tdlibx` integration for:

- phone/code/2FA authentication and persistent sessions;
- Saved Messages and writable channel discovery;
- Telegram message history and media metadata;
- document upload, progress events, on-demand download, and deletion;
- private-channel creation/rename/removal;
- thumbnail download and TDLib cache management.

Telegram API credentials are compiled into Android `BuildConfig`; they are never sent through Flutter UI or committed to source.

Create `android/secrets.properties` for local builds:

```properties
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_api_hash
```

CI may instead provide secret environment variables named `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`. `android/secrets.properties`, keystores, and signing properties are ignored by Git.

## Large and resumable files

Files accepted by Telegram directly (up to 2 GiB in this backend) are not split. Larger files are streamed into 1900 MiB parts and uploaded sequentially as hidden Telegram documents.

Each part caption records the upload UUID, original name/size/MIME type, part count, and zero-based order. After all parts finish, a JSON manifest document commits the virtual file. Completed part state is persisted after each upload. Retrying the same source resumes at the first missing/failed part rather than starting again.

Downloads fetch each part on demand and stream them into one reconstructed file. The reconstructed byte count is checked against the original manifest. Gallery and Files always model the result as one normal file, including videos.

## FTP server

Settings can start or stop a local-network FTP server and configure its username, encrypted password, and port. The screen shows live status, host, and port.

The FTP root is backed by the same repository as Files:

- root directories are Saved Messages and writable Telegram channels;
- `LIST`/`MLSD` return only user-facing Telegram files;
- `RETR` lazily downloads the requested file;
- `STOR`, `DELE`, `MKD`, `RMD`, and `RNFR`/`RNTO` modify Telegram-backed storage.

The server does not create a local mirror. A requested download or in-progress upload may use TDLib/app temporary cache for that individual file. FTP is unencrypted and should only be enabled on a trusted local network; the server stops when the provider/app process is disposed.

## Build

Requirements:

- Flutter stable
- Android SDK
- Java 17
- Telegram API credentials from [my.telegram.org](https://my.telegram.org)

```bash
flutter pub get
flutter test
flutter build apk --release
```

When no release keystore is provided, Android uses the normal development-compatible signing behavior. For production signing, create `android/key.properties` with the standard `storeFile`, `storePassword`, `keyAlias`, and `keyPassword` fields. `codemagic.yaml` remains the CI build entry point.

## Platform scope

The inherited TDLib bridge is Android-specific. A native iOS TDLib implementation would be required before enabling the same backend on iOS.

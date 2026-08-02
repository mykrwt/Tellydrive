# TellyBase

**TellyBase turns your own Telegram account into your personal cloud drive —
no custom backend, no third-party server, ever.** You sign in with your
Telegram phone number exactly like the official Telegram app, and every
photo, video, document, or file you back up is uploaded straight from your
device into a private vault inside *your own* Telegram account. Downloads,
restores, and syncing across devices all work the same way: through
Telegram's own servers, using your own session.

Built with Flutter, an Apple-inspired interface, and a pure-Dart MTProto
client so there is no native SDK (TDLib) to compile.

---

## Why this architecture

Telegram's **Bot API** (the thing most "Telegram bot" tutorials use) cannot
do a phone-number + OTP login and caps uploads at 50 MB. To act as a real
Telegram *user client* — logging in with a phone number, using the user's
own storage, uploading at Telegram's real limits — an app has to speak
**MTProto**, Telegram's actual client protocol. There are two ways to do
that without running any server of your own:

1. **TDLib**, Telegram's official C++ library — powerful, but it must be
   compiled as a native binary per platform (Android/iOS/etc.), which needs
   a real build toolchain and native packaging work.
2. **A pure-language MTProto implementation** — no native compilation, ships
   as a normal package dependency.

TellyBase uses option 2: [`t`](https://pub.dev/packages/t) (a pure-Dart
implementation of Telegram's TL schema) and
[`tg`](https://pub.dev/packages/tg) (the MTProto transport/auth layer built
on top of it) — both 100% Dart, no native binaries. This is what lets
TellyBase run as a normal Flutter app while still doing a real phone/OTP
Telegram login and real uploads/downloads through the user's own account.

## Telegram API credentials (`api_id` / `api_hash`)

Every MTProto client — official or third-party — must identify itself with
an `api_id`/`api_hash` pair from <https://my.telegram.org/apps>. So TellyBase
works with **zero setup**, it ships with the public **TEST-ONLY**
credentials that Telegram itself publishes in the open-source Telegram
Desktop repository for exactly this situation:
<https://github.com/telegramdesktop/tdesktop/blob/dev/docs/api_credentials.md>

```
api_id:   17349
api_hash: 344583e45741c457fe1862106095a5eb
```

See `lib/core/config/telegram_config.dart`. These test credentials are
rate-limited by Telegram and are **not meant for a real release** — if you
intend to actually ship TellyBase, get your own free credentials (2 minutes,
just requires your own phone number) and either edit that file or pass them
at build time so you never commit personal credentials to git:

```bash
flutter build apk \
  --dart-define=API_ID=123456 \
  --dart-define=API_HASH=your_api_hash_here
```

## How your files actually get stored

1. On first sign-in, TellyBase creates a private Telegram channel in your
   own account called **"TellyBase Cloud"** — a completely normal Telegram
   channel that you can see, rename, or inspect from the official Telegram
   app itself at any time. This is the "vault."
2. Every file you back up is:
   - Hashed (SHA-256) for integrity verification.
   - Optionally encrypted end-to-end with AES-256-GCM using a key that
     **never leaves your device** (see "Security" below), before Telegram
     ever sees a single byte.
   - Split into ordered, encrypted **segments** if it's bigger than
     Telegram's per-message upload ceiling (see `AppConstants` — ~1.99 GB
     per segment on free accounts, ~3.99 GB on Telegram Premium), so a
     20 GB video backs up as multiple linked vault messages.
   - Uploaded as a normal Telegram document message, tagged with a small
     JSON caption (`{"v":"TB1","fid":...,"idx":...,"name":...}`) that lets
     TellyBase recognize its own messages later.
3. A single **encrypted manifest** (the full file list + folder structure +
   chunk map, as JSON, AES-256-GCM encrypted) is re-uploaded and **pinned**
   in the vault channel after every change. This manifest is the entire
   "index" of your library — and it lives only in your Telegram account.
4. **Signing in on a new device**: TellyBase logs into the same Telegram
   account, finds the same vault channel, downloads + decrypts the pinned
   manifest, and your whole library reappears instantly — no external
   database, ever. If the manifest is somehow missing, TellyBase falls back
   to scanning the vault's message history directly and rebuilding the
   index from each message's caption + attached document.
5. **Downloading** a file automatically fetches every segment in order,
   decrypts them, verifies each segment's checksum, and concatenates them
   back into the original file with zero user intervention — even for
   files that were split into dozens of segments.

No TellyBase server is ever in this path. Every upload/download call in
`lib/data/telegram/telegram_vault_service.dart` goes directly from your
device to Telegram's own MTProto data centers.

## Project structure

```
lib/
  core/            Config, theming, constants, crypto engine, chunking engine
  domain/          Plain data models (FileEntry, ChunkInfo)
  data/
    telegram/      MTProto connection, auth (phone/OTP/2FA), vault, manifest
    local_db/      Encrypted on-device SQLite index (the local cache/mirror)
    repositories/  FileRepository — orchestrates chunk+crypto+Telegram+DB
  services/
    backup/        BackupEngine (queue, pause/resume/retry), incremental scan
    background/    WorkManager-driven background backup + cache cleanup
    connectivity/  Online/offline detection driving auto-retry
    cache/         Local cache size/TTL enforcement
  state/           Riverpod providers wiring everything together
  presentation/    Apple-styled screens: onboarding, home, gallery, files,
                   search, favorites, recents, backup queue, settings
```

## Security model

- **Local metadata index** (filenames, folder paths, checksums, chunk maps)
  is encrypted at rest with AES-256-GCM before it's written to the on-device
  SQLite database (`lib/data/local_db/local_database.dart`).
- **The device master key** is generated on first launch and stored only in
  the OS secure keystore/keychain (`flutter_secure_storage`) — never sent
  anywhere, including to Telegram.
- **File contents** can optionally be end-to-end encrypted the same way
  before upload, so Telegram only ever stores ciphertext if you enable it
  in Settings.
- **Integrity**: every chunk's SHA-256 is checked on download before it's
  trusted; the whole reconstructed file is checksummed again at the end.
- **No third-party servers**: the only two parties in any TellyBase network
  call are your device and Telegram's own MTProto data centers.

## Building an APK with Codemagic (no local setup needed)

This repo ships a `codemagic.yaml` at the root, so Codemagic picks it up
automatically once the repo is connected there — no Workflow Editor
configuration required. Opening a pull request against any branch triggers
the `pr-android-apk` workflow, which:

1. Runs `flutter create .` to generate the `android/` (and `ios/`) platform
   folders fresh on every build — **this repo deliberately does not commit
   those folders** (see `.gitignore`), since they need to match whatever
   Flutter/Android Gradle Plugin version Codemagic's build image has, and
   committing them tends to drift out of sync and cause mysterious CI
   failures a few Flutter releases later.
2. Runs `ci/apply_platform_config.py`, which merges TellyBase's required
   Android permissions (Internet, media read, background work,
   notifications — see `ci/android_manifest_additions.xml`) and iOS
   `Info.plist` keys (`ci/ios_info_plist_additions.xml`) into the
   just-generated platform projects. This script is idempotent and only
   adds entries that aren't already present.
3. Runs `flutter pub get` and `flutter build apk --release`.
4. Uploads the resulting `.apk` as a build artifact you can download
   directly from the Codemagic build page.

There's also a `manual-android-apk` workflow that triggers on pushes to any
`arena/*` branch (matching this session's branch), for grabbing a build
without going through a PR.

**Note on signing:** without a real Android upload keystore configured,
Gradle falls back to signing the release APK with the Flutter debug key —
which installs and runs fine on your own device for testing, but Google
Play will reject it. See the comment block at the bottom of `codemagic.yaml`
for the steps to add your own keystore via Codemagic's Code signing
identities once you're ready to publish for real.

## Running this project locally

You can also build/run TellyBase directly on your own machine with the
Flutter SDK installed:

```bash
flutter create .          # generates android/ , ios/ platform folders
python3 ci/apply_platform_config.py   # merges in the required permissions
flutter pub get
flutter run
```

### Known limitations / honest caveats

- The `tg`/`t` MTProto packages are actively developed third-party pure-Dart
  implementations, not Telegram's official SDK (which is TDLib/C++). They
  cover the exact RPC calls TellyBase needs (auth, channel creation, file
  upload/download, pinning, history scan) as verified against their current
  source, but as with any young protocol implementation you should run your
  own end-to-end test of login + upload + download before relying on it for
  real backups.
- The default API credentials are Telegram's public **test-only** pair —
  expect flakier rate limits than a real `api_id`. Get your own from
  <https://my.telegram.org/apps> for anything beyond trying the app out.
- Background execution behavior (exact timing of periodic backups) is
  ultimately governed by Android's WorkManager / iOS's BGTaskScheduler, both
  of which apply OS-level battery/network throttling outside the app's
  control — this is a platform constraint, not specific to TellyBase.
- Large-file "big file" uploads (>10 MB) use `upload.saveBigFilePart`, which
  Telegram doesn't let you verify with an MD5 mid-flight the way small
  uploads can; TellyBase compensates by verifying the SHA-256 of every
  segment's *plaintext* on the way in and again on the way out.

## License

Personal project scaffold — add a license of your choosing before
publishing.

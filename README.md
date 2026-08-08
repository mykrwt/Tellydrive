# TellyBase

> A Google Photos–style private gallery where **Telegram is the invisible
> storage engine**. You sign in with your Telegram phone number, and every
> photo, video and album lives inside your own Telegram account — chunked into
> MTProto messages, indexed entirely by the metadata stored in those messages.
> There is **no chats UI, no groups, no channels, no bot, no external backend,
> and no database**. Reinstall the app, log in again, and your entire library
> rebuilds itself from Telegram.

This project is a clean, from-scratch rewrite. It is **not** the upstream
Nekogram / Telegram-Android app. Instead it reuses the same idea Nekogram does —
the **MTProto** protocol — via the pure-Dart `t` (TL schema) and `tg`
(MTProto transport) packages, so the app ships as a small, fast, native Flutter application that
only ever speaks the two Telegram surfaces it needs:

1. **Authentication** (MTProto): phone number login → OTP → 2FA password.
2. **Storage** (MTProto): upload/download of file parts against your own
   **Saved Messages** chat.

Everything Telegram exposes that a user normally sees — chats, groups, channels,
calls, stories, contacts, bots, notifications, settings — is intentionally absent.

---

## Philosophy

| Requirement | How TellyBase meets it |
| --- | --- |
| No visible Telegram UI | The only Telegram surface is your *Saved Messages* chat (peer = your own user). Nothing else is read or written. |
| No external backend / DB | The library index is rebuilt from **message captions** in Saved Messages. |
| Original quality, no compression | Media is uploaded via MTProto as raw documents (`InputDocument`) — Telegram does not re-encode documents. |
| Very large files | Files are chunked into multiple document messages (< 2 GiB each, default 512 MiB). A chunk **manifest** of message-ids is embedded in the first chunk's caption, so chunks are stitched back transparently during download. |
| Preserve original filenames | Each chunk document carries the original filename in its Telegram `document attribute` **and** in the metadata caption; downloads are written back under the exact original name. |
| Rebuild after reinstall / new device | `LibraryRepository.syncFromTelegram()` walks Saved Messages history, parses `__tellybase` metadata captions, and reconstructs items, albums, favorites and trash. |
| Clean architecture | `presentation → controller → usecase → repository → datasource → telegram core`, with domain entities independent of Flutter/MTProto. |

---

## How storage works (the important part)

### The vault

Every upload is stored in the user's **Saved Messages** (`peer = self`, chat
id = your numeric user id). There is no channel to join and nothing to configure.

### The message layout for a single file

1. The file is split into `N` chunks of `CHUNK_SIZE` bytes (default `512 MiB`).
2. Chunk **0** is sent as a Telegram document. Its caption is a compact JSON
   metadata record (see below). Sending returns a `message_id = m0`.
3. Chunks `1..N-1` are sent as documents with a minimal `{"t":"part",...}`
   caption. They are never shown as standalone items.
4. The first chunk's caption is **edited** once all chunks exist to append
   `"ch": [m0, m1, ..., mN-1]` — the chunk manifest. This lives in Telegram
   forever, so any future device can find every part.
5. A local thumbnail is cached so the grid renders instantly; the full image is
   streamed on demand.

### Metadata caption schema (compact JSON, well under Telegram's 1024-char caption)

```jsonc
{
  "v": 1,            // schema version
  "t": "item",       // record type: "item" | "album" | "part"
  "id": "<uuid>",    // stable TellyBase item id
  "fn": "IMG_0042.jpg", // ORIGINAL filename — preserved end-to-end
  "m":  "image/jpeg",   // MIME type
  "s":  4829382,        // total byte size (sum of all chunks)
  "u":  1690000000,     // upload time (epoch seconds)
  "c":  0,              // capture time (epoch seconds), if known
  "a":  null,           // album id, if any
  "an": null,           // album display name
  "f":  false,          // favorite flag
  "tr": false,          // trashed flag
  "n":  3,              // total chunk count
  "first": m0,          // message id of chunk 0 (the authoritative record)
  "ch": [m0, m1, m2]    // chunk manifest (message ids), edited in after upload
}
```

Because flags (`favorite`, `trashed`, album membership) live in the caption, toggling
favorite/trash = one `editMessage` on the first chunk — and the change is durable
in Telegram, surviving reinstall.

### How the library rebuilds itself

`syncFromTelegram()` paginates `messages.getHistory` on the Saved Messages peer,
decodes every caption, skips `part` records, and merges `item`/`album` records
into the in-memory + on-disk index. Trashed items are grouped in **Trash**,
favorites in **Favorites**, albums are assembled from the `a`/`an` fields, and
**Storage Usage** is a roll-up of `s` per day/month.

---

## Project layout

```
lib/
  main.dart
  app/
    tellybase_app.dart        # Material 3 app + navigation shell
    router.dart
    theme/                    # Material 3 color & typography tokens
  core/
    config/app_config.dart
    di/providers.dart         # Riverpod providers (composition root)
    error/                    # typed exceptions
    utils/                    # dates, sizes, mime, chunking, crypto
    storage/                  # secure session store, media cache, index cache
    widgets/                  # grid, thumbnail, date header, zoom viewer…
  telegram/                   # <-- the ONLY place that imports t/tg
    core/                     # TelegramCore (auth + storage) contracts
    mtproto/                  # MTProto transport & adapters (the seam)
    metadata/                 # metadata codec, chunking plan
    models/
  features/
    auth/                     # phone → OTP → 2FA → session
    library/                  # item/album domain + rebuild-from-Telegram
    gallery/                  # Google Photos–style home grid & full-screen viewer
    albums/
    favorites/
    search/
    trash/
    storage/                  # usage breakdown
    downloads/
    settings/
    backup/                   # auto-backup (WorkManager + photo_manager)
```

### The Telegram seam

`lib/telegram/core/telegram_core.dart` defines two small interfaces:

- `TelegramAuth` — `sendCode`, `signIn`, `checkPassword`, `getMe`, `logOut`,
  plus session load/save.
- `TelegramStorage` — `uploadItem`, `downloadItem`, `syncHistory`,
  `updateItem`, `deleteItems`.

`lib/telegram/mtproto/mtproto_transport.dart` is the *only* file that imports
`package:t` or `package:tg`. It maps the TL API calls (`auth.sendCode`,
`auth.signIn`, `auth.checkPassword`, `account.getPassword`,
`messages.getHistory`, `upload.saveBigFilePart`/`upload.saveFilePart`,
`messages.sendMedia`, `upload.getFile`, `messages.editMessage`,
`messages.deleteMessages`) onto `tg.Client`. If you upgrade either package and
its API changes, this one file is all you touch.

---

## Running it

Telegram requires every client to identify itself with a valid, matching API
ID/hash pair. **There is intentionally no fallback credential in this repo**:
shared or published API keys are rejected by Telegram and produce
`API_ID_INVALID` / `API_ID_PUBLISHED_FLOOD` rather than a usable login.

1. Sign in at [my.telegram.org/apps](https://my.telegram.org/apps) as the app
   owner and create (or rotate) a private application. Do not use Telegram's
   official-client credentials or an API pair copied from another project.
2. Create a local credentials file. It is ignored by git:

   ```bash
   cp telegram_api.json.example telegram_api.json
   # Edit telegram_api.json with your own API ID and 32-character API hash.
   ```

3. Build/run with that file. Stop a previously running app first — dart defines
   are compiled into the binary, so a hot reload is not enough:

   ```bash
   flutter create . --platforms android,ios --org app.tellybase # if needed
   flutter pub get
   flutter run --dart-define-from-file=telegram_api.json
   ```

   Or pass values directly from a secure shell/CI secret store:

   ```bash
   flutter build apk --release \
     --dart-define=TELEGRAM_API_ID="$TELEGRAM_API_ID" \
     --dart-define=TELEGRAM_API_HASH="$TELEGRAM_API_HASH"
   ```

For Codemagic, define `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` in the
`tellybase_secrets` group. The pipeline now fails before building if either is
missing or malformed, preventing another non-working APK from being shipped.

### Required Android permissions (already in `android/app/src/main/AndroidManifest.xml`)

- `INTERNET` — MTProto transport
- `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` — auto-backup gallery scan (API 33+)
- `READ_EXTERNAL_STORAGE` (maxSdk 32) / `READ_MEDIA_VISUAL_USER_SELECTED`
- `POST_NOTIFICATIONS` — background upload/download progress
- `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE` — reliable background backups

### First-run flow

1. **Phone number** → Telegram sends the OTP.
2. **OTP** → signed in (or sign-up if the number is new).
3. **2FA** → shown only if the account has a two-step password.
4. The session (auth key) is stored in the OS secure store.
5. **Home** → if the library is empty it syncs from Saved Messages, then presents
   the day-grouped gallery. Enable **Backup & Sync** to start auto-uploading the
   device gallery in the background.

---

## Deliberate limitations

- Storage is your own Telegram account, so it is subject to Telegram's per-DC
  file and rate limits and to your account's total quota (your Telegram space is
  not unlimited). Chunking keeps individual messages < 2 GiB, but very large
  libraries will consume your account's storage.
- Deletion is **soft by default**: moving an item to **Trash** flips the
  `tr` flag in Telegram. Permanent delete calls `messages.deleteMessages` on the
  chunk messages.
- This release ships the MTProto adapter against the `t`/`tg` packages;
  verify exact method signatures against the pinned versions in
  `lib/telegram/mtproto/mtproto_transport.dart` before building.
- The app intentionally cannot and does not read other chats. If you later want
  shared/collaborative albums, add them by pointing `TelegramStorage` at a
  private channel — the rest of the app is already channel-agnostic.

---

## Security notes

- API id/hash and session auth keys are treated as secrets. API credentials are
  injected at build time (never committed); the session is held in
  `flutter_secure_storage` (Keychain/Keystore).
- If Telegram rejects an API pair, rotate it at `my.telegram.org/apps`, update
  the secure build variables, and distribute a fresh APK. Retrying an OTP or
  changing the phone number cannot repair an invalid application credential.
- No third-party server ever sees your photos; the only network peers are
  Telegram's MTProto datacenters.
- Metadata captions are plaintext JSON (as Telegram stores all non-secret-chat
  messages). If you want encryption at rest, extend `MetadataCodec` to wrap the
  payload — the codec is already a single choke point.

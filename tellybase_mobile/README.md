# TellyBase for Android

A native Flutter client for the private TellyBase cloud. This is a standalone
Android project; it does not contain the web landing page, pricing, FAQ, or any
other marketing-only route.

## Product scope

- Secure sign-up, sign-in, persisted Keystore-backed session, and sign-out
- Day-grouped photo/video gallery with search, type filters, sorting, favorites,
  selection, viewer, video playback, pagination, and pull-to-refresh
- Native file manager with nested folders, breadcrumbs, search, categories,
  grid/list layouts, create/rename/move/delete, uploads, downloads, and previews
- Sequential resumable-style 4 MiB multipart uploads up to 2 GB with a global
  transfer queue and per-file progress
- Storage dashboard and account/security experience
- Admin-only instance metrics, storage breakdown, user list, and role management
- Dark Material 3 design built for phones and adaptive multi-column layouts

Telegram bot tokens and channel identifiers are **never bundled in the APK**.
The app talks to the existing server over a signed, HTTP-only-compatible session.

## Architecture

The code follows feature-first Clean Architecture:

```text
lib/
├── app/                       # App composition and design system
├── core/
│   ├── config/                # Build-time/environment configuration
│   ├── di/                    # Riverpod dependency graph
│   ├── error/                 # Typed application failures
│   ├── network/               # Dio client and cookie interceptor
│   ├── services/              # Android file-opening service
│   ├── storage/               # Secure session + preferences abstractions
│   ├── utils/                 # Pure formatting utilities
│   └── widgets/               # Shared native UI primitives
└── features/
    ├── auth/
    ├── dashboard/
    ├── storage/               # Shared cloud domain/data layers
    ├── gallery/               # Gallery presentation module
    ├── files/                 # File-manager presentation module
    ├── admin/
    ├── account/
    └── shell/
```

Within a feature, dependencies point inward:

```text
presentation → domain ← data
```

Domain entities/repository contracts have no Flutter or Dio dependency. Data
sources own HTTP and serialization. Repositories map remote models to entities.
Use cases contain app operations. Controllers own view state. Device storage and
networking are injected behind interfaces.

See [`docs/MOBILE_API.md`](docs/MOBILE_API.md) for the server contract and
[`docs/RELEASE.md`](docs/RELEASE.md) for Android release guidance.

## Prerequisites

- Flutter stable 3.44.x (Dart 3.12.x) or a compatible newer stable version
- Android Studio / Android SDK with Java 17+
- A running TellyBase server containing `/api/mobile/v1`

## Configure and run

The Android emulator default points to the host machine at `10.0.2.2:3000`:

```bash
cd tellybase_mobile
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

For a physical device or production build, use an HTTPS deployment:

```bash
flutter run \
  --dart-define=API_BASE_URL=$API_BASE_URL
```

`API_BASE_URL` is compiled into the app. Never put bot tokens, session secrets,
or Telegram chat identifiers in `--dart-define`.

## Verification

```bash
flutter format --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build apk --debug \
  --dart-define=API_BASE_URL=$API_BASE_URL
```

Release builds should use an organization-controlled keystore and CI secret
injection. Do not commit `android/key.properties` or any keystore.

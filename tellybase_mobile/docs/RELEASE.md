# Android release checklist

## Environment

1. Install Flutter stable and Android SDK tooling.
2. Run `flutter doctor -v` and resolve Android toolchain findings.
3. Use an HTTPS production `API_BASE_URL`.
4. Configure `SESSION_SECRET`, Telegram credentials, and admin accounts on the
   server only.

## Signing

Generate and protect an upload keystore outside Git. Add a local
`android/key.properties` only in the release environment. Both it and `*.jks`
are ignored. `android/app/build.gradle.kts` reads the standard `keyAlias`,
`keyPassword`, `storeFile`, and `storePassword` values. CI fails fast when the
file is absent; local smoke builds may temporarily fall back to debug signing.

## Quality gates

```bash
flutter pub get
flutter format --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build appbundle --release \
  --obfuscate \
  --split-debug-info=build/symbols \
  --dart-define=API_BASE_URL=$API_BASE_URL
```

Retain `build/symbols` in protected release artifacts for crash symbolication.
Exercise sign-in, upload, media playback, download/open, folder operations,
session expiration, offline errors, and admin authorization on a physical device.

## Security

- Never ship a non-TLS production URL.
- Never package Telegram bot tokens or `SESSION_SECRET` in Android resources.
- Rotate the release keystore and server session secret through approved secret
  management processes.
- Review server and dependency updates before each release.

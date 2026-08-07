# Mobile API contract

The Flutter app uses a versioned adapter added under `/api/mobile/v1` plus the
existing authenticated file and folder endpoints. This preserves the existing
Telegram-backed server as the source of truth while keeping secrets out of the
mobile client.

## Session model

Authentication responses set the existing `tellydrive_session` signed cookie.
The native Dio interceptor stores only the `name=value` pair in Android encrypted
storage, sends it as a `Cookie` request header, rotates it from `Set-Cookie`, and
deletes it on expiration or sign-out. Passwords and Telegram credentials are
never persisted by Flutter.

All endpoints return JSON errors as:

```json
{ "error": "Human-readable message" }
```

Sensitive responses use `Cache-Control: no-store`, and authentication is
rate-limited by IP and account key.

## Versioned endpoints

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/mobile/v1/auth/sign-in` | Authenticate and create session |
| `POST` | `/api/mobile/v1/auth/sign-up` | Register and create session |
| `GET` | `/api/mobile/v1/auth/session` | Restore current account |
| `DELETE` | `/api/mobile/v1/auth/session` | Revoke current session |
| `GET` | `/api/mobile/v1/dashboard` | Account and storage summary |
| `PATCH` | `/api/mobile/v1/files/:id/favorite` | Set favorite state |
| `GET` | `/api/mobile/v1/admin` | Admin metrics and users |
| `PATCH` | `/api/mobile/v1/admin/users/:id` | Change backend role/account/subscription/storage policy |
| `PATCH` | `/api/mobile/v1/admin/system` | Change backend maintenance state |

## Existing storage endpoints used by Android

- `GET/POST /api/files`
- `GET/PATCH/DELETE /api/files/:id`
- `POST /api/files/upload-part`
- `POST /api/files/finalize`
- `GET/POST /api/folders`
- `GET/PATCH/DELETE /api/folders/:id`

Native clients intentionally omit the browser `Origin` header. Ownership checks,
input validation, authenticated-encrypted upload grants, rate limits, and
server-side session validation still apply to every operation.

Media and thumbnails are always streamed from these same-origin APIs. The app
never receives Telegram Bot API URLs, bot/channel/message IDs, or any other
System A storage reference.

Session responses include backend-computed account, subscription, and
entitlement fields for display only. Flutter never authorizes from those cached
values: every account, storage, upload, download, premium, maintenance, ban, and
admin decision is re-evaluated by the backend when the operation is requested.

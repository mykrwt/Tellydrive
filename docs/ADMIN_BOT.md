# Telegram Admin Console (Phase 4)

The administration interface for TellyBase is a **private Telegram bot**. There
is no web dashboard: the operator talks to the bot from their own Telegram
account, and the bot is a thin bridge to secure backend APIs.

## Architecture

```text
Operator (Telegram, private chat)
        │  Telegram Bot API (private admin bot, long polling)
        ▼
scripts/admin-bot.mjs  ── the BRIDGE ── pure plumbing only
        │  POST /api/admin-bot/update
        │  headers: X-Admin-Bot-At (fresh timestamp)
        │           X-Admin-Bot-Signature (HMAC-SHA256 of "<at>\n<body>")
        │           X-Admin-Bot-Id (bot username from getMe)
        ▼
app/api/admin-bot/update/route.ts  ── the GATEWAY
        │  verifies signature + freshness + per-bot update-id dedupe
        │  verifies sender ∈ TELEGRAM_ADMIN_IDS
        │  rate limits per operator
        ▼
lib/server/admin-console.ts  ── the BRAIN (business logic, backend-side)
        │  interprets commands/menus → validated store operations
        ▼
lib/telegram-store.ts / lib/telegram-storage.ts  ── System A data & storage
        │
        ▼
outbound action plan → bridge executes sendMessage/editMessageText/…
```

- **The bridge contains no business logic.** It polls `getUpdates`, forwards
  each update signed with a shared secret, and blindly executes the Telegram
  API calls the backend returns.
- **The backend performs every action**, after proving (a) the request really
  came from our own bridge (HMAC signature + freshness window) and (b) the
  update originated from the operator's authorized Telegram account
  (`TELEGRAM_ADMIN_IDS`). Command parsing, menu state, validation, and all
  store mutations live server-side.
- Unauthorized senders are rejected twice: the bridge refuses to forward them
  (defense in depth) and the gateway refuses to process them.

## Setup

1. Create a **dedicated** bot with [@BotFather](https://t.me/BotFather)
   (never reuse the account-database bot). Copy its token.
2. Find your numeric Telegram user ID (e.g. with @userinfobot).
3. Configure backend-only environment variables (see `.env.example`):

   | Variable | Purpose |
   |---|---|
   | `TELEGRAM_ADMIN_BOT_TOKEN` | Token of the private admin-console bot |
   | `TELEGRAM_ADMIN_IDS` | Comma-separated numeric Telegram user IDs allowed to control the bot |
   | `ADMIN_BOT_SHARED_SECRET` | HMAC secret shared between the bridge and the backend (`openssl rand -hex 32`) |
   | `ADMIN_BOT_API_URL` | Backend base URL the bridge calls (default `http://127.0.0.1:3000`) |
   | `TELEGRAM_API_BASE` | Optional Bot API origin override (must point at the same Telegram API for bot and backend) |

   The backend needs `TELEGRAM_ADMIN_BOT_TOKEN` **and** `TELEGRAM_API_BASE` to
   download APK documents from Telegram before storing them.

4. Start the backend, then run the bridge in a separate process:

   ```bash
   npm run dev            # terminal 1 — the backend
   npm run admin-bot      # terminal 2 — the bridge (npm run admin-bot)
   ```

   In production, keep the bridge running next to the backend (systemd/pm2).
   The bridge loads `.env` / `.env.local` automatically.

5. Open a private chat with the bot and send `/start`.

## Commands & menus

| Command | Action |
|---|---|
| `/start` `/menu` | Main menu (inline keyboard) |
| `/stats` | Current statistics (users, files, storage, plans, maintenance) |
| `/analytics` | Trends: signups/logins/uploads, signup bars, top users |
| `/users` | Paginated user list (tap a user to open their card) |
| `/user <email or name>` `/search <query>` | Search users |
| `/ban <email>` `/unban <email>` | Ban / unban an account |
| `/premium <email> <days>` | Grant an active premium plan |
| `/maintenance on [message]` `/maintenance off` | Toggle maintenance mode |
| `/announce <text>` `/announce off` | Set / clear the in-app announcement |
| `/apk` | Upload a new APK release (send the `.apk` file) |
| `/releases` | List releases (draft / published / archived) |
| `/logs [n]` | Recent backend activity (audit trail) |
| `/help` | Command reference |

Typing any email or name directly also searches users.

### User card actions

Opening a user shows their account card with buttons: ban / unban / suspend /
activate, grant premium (7/30/90/365 days or custom), cancel plan, toggle
storage access, make/remove admin. Every action is logged to the activity log.

### APK release flow

1. `/apk`, then send the `.apk` file (max 20 MB — the Telegram Bot API
   download cap; split/ABI builds are typically smaller).
2. The backend downloads the document from Telegram, verifies it is a ZIP/APK
   container, stores the bytes in the private storage channel, computes
   `sha256`, and creates a **draft** release.
3. Send the version details: `1.2.3 42 Short release notes` (name, code, notes).
   A version hint is pre-filled from file names like `tellybase-1.2.3+42.apk`.
4. Tap **Publish** on the release card. Publishing retires the previous
   release; the mobile app then sees the new one via
   `GET /api/mobile/v1/app/state` and downloads it through
   `GET /api/mobile/v1/releases/latest/download` (authenticated, bytes proxied
   by the backend — no Telegram URLs are ever exposed).

### Announcements

`/announce <text>` publishes a global in-app announcement returned by
`/api/mobile/v1/app/state`. "Broadcasting" is in-app by design: the account
database deliberately stores no user Telegram identities, so TellyBase cannot
message users directly.

## Security model

- The bridge is a System A component (operator-controlled, backend-side). It
  never interprets content, never touches the database, and never holds
  anything but the bot token, the shared secret, and the backend URL.
- The gateway rejects requests with a stale (`±5 min`) or invalid signature,
  duplicate update ids (per bot, 10-minute window), senders not in
  `TELEGRAM_ADMIN_IDS`, or excessive rates (`90/min` per operator).
- Signature failures and allowlist failures both return `403` so the gateway
  does not disclose which check failed.
- Bootstrap operator accounts (`ADMIN_EMAILS`) cannot be banned, suspended,
  demoted, or stripped of storage from the bot — the operator cannot lock
  themselves out.
- Every admin action is recorded in the backend activity log with the
  `telegram:<id>` actor.
- Run the boundary check as part of CI:

  ```bash
  npm run security:telegram-boundaries
  npm run lint
  npm run build
  ```

## Notes & limitations

- APKs are limited to 20 MB because the public Telegram Bot API caps bot
  downloads (`getFile`) at 20 MB. A self-hosted local Bot API server lifts
  this limit; the cap is enforced server-side with a clear error message.
- Conversational state (pending prompts, list pages) lives in backend memory
  per deployment instance; a restart simply resets pending prompts.
- The activity log is capped at the 500 most recent entries.
- `TELEGRAM_ADMIN_IDS` and `ADMIN_BOT_SHARED_SECRET` are backend-only
  credentials. Never prefix them with `NEXT_PUBLIC_`, place them in Flutter
  build defines, or include them in an APK.

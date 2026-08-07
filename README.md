# TellyDrive

A complete private cloud storage and credentials experience for Next.js 16 with a private Telegram chat acting as the production storage & account database.

> **New here?** Start with the plain-language walkthrough:
> [`docs/GO_LIVE_GUIDE.md`](docs/GO_LIVE_GUIDE.md) — hosting, env setup,
> building the app, and using the Telegram admin bot, step by step.

## Features

- Sign up, sign in, remember-me sessions, protected dashboard, and sign out
- Passwords hashed with Node.js `scrypt` and unique salts (plaintext is never stored)
- Signed, HTTP-only, SameSite session cookies
- Versioned JSON account database uploaded to Telegram
- Responsive dark UI with loading, validation, error, and connection states
- Local JSON fallback during development so the flow can be tested immediately

### Storage sections

- **Gallery** (`/dashboard`) — photos and videos only, with a Google Photos–style
  browsing experience: day-grouped grid ("Today", "Yesterday", dates), hover
  selection, lightbox viewer, search, filters, chunked uploads up to 2 GB.
- **Files** (`/dashboard/files`) — a full-featured cloud file manager with folders and
  subfolders: create/rename/move/delete folders, upload files into any folder,
  category filtering (Documents, Media, Audio, Archives), move/rename/delete files,
  breadcrumb navigation, grid & list views, previews for images/videos/audio/docs,
  and downloads.
- **Admin** (`/dashboard/admin`) — administrator-only page with upload &
  file management, instance statistics (users, files, folders, storage),
  a user table with role management, and reserved slots for future admin tools.
- **Telegram Admin Console** (Phase 4) — instead of a web dashboard, a private
  Telegram bot is the operator's administration console: APK release uploads &
  publishing, ban/unban, subscription changes, user list/search, statistics &
  analytics, maintenance mode, in-app announcements, and an activity log.
  The bot is a thin signed bridge to backend APIs — all business logic and
  authority checks run server-side. See [`docs/ADMIN_BOT.md`](docs/ADMIN_BOT.md).

### Admin accounts

An account is an admin when its stored `role` is `"admin"` (promotable from the
Admin page) **or** its email is listed in `ADMIN_EMAILS` (comma-separated,
case-insensitive). To bootstrap the **first** admin (no admin exists yet to do
the promoting):

1. **CLI, takes effect immediately (no redeploy):** pass the exact email of an
   existing account to `node scripts/set-admin.mjs` (or `npm run make-admin --`;
   add `--demote` to revoke). Run it from the repo root with the private backend
   Telegram variables loaded from the server environment. It edits the role
   directly in the backend database (or the local `.data/auth.json` development
   fallback when backend Telegram is intentionally unconfigured).
2. **Env var:** set `ADMIN_EMAILS` in the backend secret manager to the exact
   comma-separated account emails, then redeploy/restart. The account keeps
   admin rights only while its email stays in the list.

Afterwards the **Admin** section appears in the dashboard navigation
(`/dashboard/admin`) — no re-login needed.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Without Telegram variables, development uses `.data/auth.json` automatically.

## Telegram admin console (operator only)

Run the backend, then in a second terminal:

```bash
npm run admin-bot
```

Requires `TELEGRAM_ADMIN_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS`, and
`ADMIN_BOT_SHARED_SECRET` (see [`.env.example`](.env.example) and
[`docs/ADMIN_BOT.md`](docs/ADMIN_BOT.md)). The bridge polls the private admin
bot and forwards signed updates to the backend gateway
(`POST /api/admin-bot/update`), which validates the signature and that the
sender is an authorized administrator before executing anything. The bridge
contains no business logic.

## Connect private backend Telegram infrastructure for production

> This setup is **System A (operator/admin only)**. Its bots, channels, IDs,
> sessions, and environment values must never be sent to a browser or mobile
> client. See [`docs/TELEGRAM_ARCHITECTURE.md`](docs/TELEGRAM_ARCHITECTURE.md)
and [`docs/BACKEND_AUTHORITY.md`](docs/BACKEND_AUTHORITY.md).

1. Create a private backend bot with [@BotFather](https://t.me/BotFather) and copy its token into the backend secret manager.
2. Create a **private channel or supergroup dedicated to TellyDrive** (basic groups are not supported).
3. Add the bot as an administrator with permission to:
   - **Post Messages** (to upload database revisions)
   - **Edit Chat Info** ("Change Channel Info" / "Change Group Info", so the bot can update the `TBAUTH:<file_id>` pointer in the description)
4. Obtain the numeric channel or supergroup ID and store it only in the backend secret manager.
5. Configure the server-only variable names documented in [`.env.example`](.env.example) using the exact private values issued for your infrastructure.

Never prefix Telegram infrastructure variables with `NEXT_PUBLIC_`, place them
in Flutter build defines, or include them in an APK. `SESSION_SECRET` is
recommended; if absent, the backend currently derives session signatures from
the private backend bot token.

The app uploads `tellydrive-auth-rN.json` to the private chat and saves the latest Telegram `file_id` in the chat description as `TBAUTH:<file_id>`.

## Troubleshooting Telegram setup

- **Bad Request: chat not found**: Ensure `TELEGRAM_CHAT_ID` includes the `-100` prefix for supergroups/channels, and verify the bot was added to the chat.
- **Bad Request: not enough rights to change chat info**: Edit the bot's admin permissions in Telegram and enable "Change Channel Info" or "Change Group Info".
- **Unauthorized**: Re-check `TELEGRAM_BOT_TOKEN`.
- **Method is available only for supergroups and channels**: Convert your group into a supergroup or create a private channel.

## Verify

```bash
npm run security:telegram-boundaries
npm run lint
npm run build
```

## Security notes

Private Telegram infrastructure credentials stay in server-only modules. All
file and thumbnail bytes are fetched through authenticated same-origin backend
proxies; Telegram Bot API URLs and storage identifiers are never returned to a
client. Upload-part capabilities use authenticated encryption so their internal
storage metadata cannot be decoded by users.

A future user Telegram login is a separate identity signal only. It cannot
assign roles, subscriptions, trusted-device status, or backend permissions.
Every privileged operation remains subject to backend authentication,
authorization, ownership checks, and rate limiting.

The stored database contains profile fields, timestamps, password salts, and
scrypt hashes—never plaintext passwords. For a high-risk production system, add
distributed rate limiting, email verification, password recovery, and MFA or
use a dedicated authentication provider.

---

**Admin Bot webhook (production):** `npm run admin-bot:webhook -- <url>` configures Telegram to push to `/api/admin-bot/webhook`. The site answers the bot directly (`executeBotOutboundBatch`). No bridge / VPS required. Use `npm run admin-bot:webhook-unset` to return to local bridge mode.

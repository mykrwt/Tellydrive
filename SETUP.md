# Setup Guide

This app follows the PRD (see `PRD.md`, especially Appendix B). Authentication is
**Clerk**; files and metadata go through the **Storage Manager**, which uses a
**Telegram** backend when configured.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend key |
| `CLERK_SECRET_KEY` | Yes | Clerk backend key (server-only, never exposed) |
| `TELEGRAM_BOT_TOKEN` | Owner only | Owner's bot: stores the metadata DB + default file backend |
| `TELEGRAM_CHAT_ID` | Owner only | Owner's chat/channel the bot uses |
| `STORAGE_BACKEND` | No | `auto` (default), `telegram`, or `local` |
| `ADMIN_USER_IDS` | No | Comma-separated Clerk user ids granted admin access |
| `DATA_DIR` | No | Where local-backend files & sqlite live (default `data`) |
| `RECYCLE_RETENTION_DAYS` | No | Days before trashed items auto-delete (default `30`) |

## Getting a Clerk key

1. Create a free account at https://dashboard.clerk.com/
2. Create an **Application**.
3. On the API Keys page copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → publishable key
   - `CLERK_SECRET_KEY` → secret key
4. Paste both into `.env.local`.

If you already have these in Vercel, just set them as environment variables
there and redeploy — do **not** commit them.

## Setting up Telegram storage (how to get the tokens)

1. Create a bot with **BotFather** in Telegram:
   - Open a chat with `@BotFather`
   - Send `/newbot`, choose a name and a username
   - BotFather replies with an HTTP API **token** like
     `123456789:AA...`. That is your `TELEGRAM_BOT_TOKEN`.
2. Create a private storage chat/channel:
   - **Option A (private channel):** in Telegram tap ☰ → New Channel → *Private*.
     Add your bot as an **administrator** with **posting** rights.
   - **Option B (private group):** create a group, add your bot, and post one
     message so the bot can see the chat.
3. Get the **chat id**:
   - Send any message in the chat, then open
     `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
     in your browser and find the numeric `chat.id` field.
   - Or message `@userinfobot` and it replies with your chat id.
   - That number is your `TELEGRAM_CHAT_ID`.
4. Set both in `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AAxxxxx
   TELEGRAM_CHAT_ID=-1001234567890
   ```

### How the app stores data on Telegram

- **Files** go through the Storage Manager (the Telegram backend uploads each
  file as `sendDocument` and saves the returned `file_id`). Files larger than
  ~15 MB are split into chunks and reassembled transparently.
- **Metadata** (users, folders, files table, plans, activity, settings) is a
  SQLite database that is **also stored in the same chat**. After every write
  the app checkpoints and re-uploads the database as a document, and records the
  current document's `file_id` in the chat's *description* (`setChatDescription`).
  On a serverless cold start the app reads that pointer (`getChat`) and downloads
  the latest database copy, so nothing is lost between ephemeral instances.
- **The bot must be an administrator of the chat** so it can call
  `setChatDescription` / `getChat` and `getFile` / `sendDocument`. This works for
  both Option A (private channel) and Option B (private group) above.
- Business logic never talks to Telegram directly — the Storage Manager and the
  metadata-DB sync layer are swappable.
- **No bot token ever reaches the browser.** All storage calls run server-side.

#### Bring-your-own-Telegram (per-user file storage)

- Each end user can connect **their own** bot + chat in **Settings → Your
  storage** so their uploaded files live in their own Telegram instead of the
  owner's shared backend. Their token/chat are stored on the `users` row
  (`tg_bot_token`, `tg_chat_id`) and are only used server-side to upload/download
  that user's files — they are never sent to the browser.
- Users without their own config fall back to the **owner's** backend (env
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`).
- The **metadata database stays on the owner's account** (so admins can manage
  all users/plans); only file bytes move to each user's own Telegram.
- On Settings the app validates the connection (`getChat`) before saving, so a
  bad token/chat can't lock a user out of their storage.

#### Persistence model & caveats

- Because the whole database is persisted to the owner's Telegram, there is **no
  separate hosted database to run** — the owner's `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` are the only "database" you need.
- The sync is **single-writer**: it's designed for one app instance writing at a
  time (ideal for a single user / low traffic). If you deploy many Vercel
  instances and they write concurrently, the last flush wins and concurrent
  updates could be lost. For real multi-user concurrency, put the metadata in a
  hosted database (Postgres/Neon, Turso, Supabase) and keep Telegram as the file
  store.
- Each write triggers a checkpoint + upload, which adds some latency to
  mutations (a child process does the network call synchronously). Read-only
  page views do not flush (last-activity updates are throttled).

## Storage backend behavior

- If `STORAGE_BACKEND=telegram` (or `auto` with tokens set) → uses Telegram.
- If tokens are missing → falls back to a **local disk** backend (under
  `DATA_DIR`) so you can still develop/test without tokens.

> Note: the local backend and the SQLite metadata database use the server's
> filesystem. On serverless hosts (e.g. Vercel) that filesystem is **read-only**
> (except `/tmp`) and ephemeral, so the app automatically falls back to a
> writable temp directory when the configured `DATA_DIR` isn't writable — that
> keeps the dashboard and account creation working instead of failing with
> "Unable to load account". When `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are
> set, the metadata database itself is also mirrored to Telegram (see above), so
> the durable copy survives cold starts; the local `/tmp` copy is only a
> working cache for the current instance.

## Making yourself an admin

Add your Clerk user id to `ADMIN_USER_IDS` (comma separated), or set it in
Vercel. You can find your user id in the Clerk dashboard, or in the app the
first time you log in via a profile request.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

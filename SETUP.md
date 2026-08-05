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
| `TELEGRAM_BOT_TOKEN` | For Telegram storage | Bot token used to store files |
| `TELEGRAM_CHAT_ID` | For Telegram storage | Chat/channel the bot uploads files into |
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

### How the app stores files

- The Storage Manager uploads each file (as `sendDocument`) to that chat and
  saves the returned Telegram `file_id`. Files larger than ~15 MB are split
  into chunks and reassembled transparently.
- Business logic never talks to Telegram directly — the backend can be swapped
  (S3 / object storage / Postgres) without rewriting the app.
- **No bot token ever reaches the browser.** All storage calls run server-side.

## Storage backend behavior

- If `STORAGE_BACKEND=telegram` (or `auto` with tokens set) → uses Telegram.
- If tokens are missing → falls back to a **local disk** backend (under
  `DATA_DIR`) so you can still develop/test without tokens.

> Note: the local backend and the SQLite metadata database use the server's
> filesystem. On serverless hosts (e.g. Vercel) that filesystem is ephemeral,
> so for production you should configure the Telegram backend (or another
> persistent backend behind the Storage Manager).

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

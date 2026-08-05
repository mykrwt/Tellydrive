# Tellybase Auth

A complete credentials sign-in experience for Next.js 16 with a private Telegram chat acting as the production account database.

## Features

- Sign up, sign in, remember-me sessions, protected dashboard, and sign out
- Passwords hashed with Node.js `scrypt` and unique salts (plaintext is never stored)
- Signed, HTTP-only, SameSite session cookies
- Versioned JSON account database uploaded to Telegram
- Responsive dark UI with loading, validation, error, and connection states
- Local JSON fallback during development so the flow can be tested immediately

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Without Telegram variables, development uses `.data/auth.json` automatically.

## Connect Telegram for production

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Create a **private channel or supergroup dedicated to Tellybase** (basic groups are not supported).
3. Add the bot as an administrator with permission to:
   - **Post Messages** (to upload database revisions)
   - **Edit Chat Info** ("Change Channel Info" / "Change Group Info", so the bot can update the `TBAUTH:<file_id>` pointer in the description)
4. Obtain the numeric chat id (channel and supergroup ids start with `-100`, e.g., `-1001234567890`).
5. In Vercel or your `.env` file, add:

```env
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_CHAT_ID=-1001234567890
SESSION_SECRET=optional_random_32_byte_secret
```

`SESSION_SECRET` is recommended; if absent, the server derives session signatures from the bot token. Never prefix Telegram variables with `NEXT_PUBLIC_`. Do not wrap values in quotes or include a `bot` prefix in `TELEGRAM_BOT_TOKEN`.

The app uploads `tellybase-auth-rN.json` to the private chat and saves the latest Telegram `file_id` in the chat description as `TBAUTH:<file_id>`.

## Troubleshooting Telegram setup

- **Bad Request: chat not found**: Ensure `TELEGRAM_CHAT_ID` includes the `-100` prefix for supergroups/channels, and verify the bot was added to the chat.
- **Bad Request: not enough rights to change chat info**: Edit the bot's admin permissions in Telegram and enable "Change Channel Info" or "Change Group Info".
- **Unauthorized**: Re-check `TELEGRAM_BOT_TOKEN`.
- **Method is available only for supergroups and channels**: Convert your group into a supergroup or create a private channel.

## Verify

```bash
npm run lint
npm run build
```

## Security notes

Telegram credentials stay in server-only modules. The stored database contains profile fields, timestamps, password salts, and scrypt hashes—never plaintext passwords. For a high-risk production system, add distributed rate limiting, email verification, password recovery, and MFA or use a dedicated authentication provider.

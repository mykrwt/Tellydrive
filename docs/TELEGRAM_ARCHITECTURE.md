# Telegram security architecture

TellyBase treats backend Telegram infrastructure and a user's Telegram identity
as separate security domains. They do not share credentials, storage access,
roles, or trust.

## System A — private backend infrastructure

System A is controlled only by the operator and runs only in trusted backend or
administrative CLI processes. It includes private bots, Bot API credentials,
channels, groups, account sessions, storage identifiers, update channels, the
private admin-console bot, and backend environment configuration.

### Admin-console bot

The private Telegram admin bot (`TELEGRAM_ADMIN_BOT_TOKEN`) is the operator's
administration console (see [`docs/ADMIN_BOT.md`](ADMIN_BOT.md)). Its bridge
process (`scripts/admin-bot.mjs`) is pure plumbing: it forwards signed updates
to `POST /api/admin-bot/update` and executes the outbound Telegram calls the
backend returns. The backend gateway verifies the HMAC signature, freshness,
per-bot update dedupe, and the `TELEGRAM_ADMIN_IDS` operator allowlist before
interpreting anything. All command parsing, menus, validation, and mutations
happen in `lib/server/admin-console.ts` — never in the bridge. A Telegram
identity alone grants nothing: it must pass the gateway's signature and
allowlist checks, and every operation is still a validated backend store call.

### Boundary

- `lib/server/admin-telegram-config.ts` is the application configuration gateway.
- `lib/telegram-store.ts` and `lib/telegram-storage.ts` consume System A only.
- `lib/server/admin-bot-gateway.ts` and `lib/server/admin-console.ts` are the
  admin-console brain and run only behind the signed bridge gateway.
- Browser and Flutter clients call authenticated TellyBase API routes only.
- File, video, and thumbnail routes proxy bytes through the backend.
- Telegram Bot API file URLs are private because they embed a bot token. They
  may be used only as transient backend `fetch()` targets.
- Telegram file/message/channel IDs are backend metadata and are never part of
  a client response.
- Upload-part grants are AES-256-GCM sealed before they are returned to a client.
- Admin access is assigned by backend role policy, never by Telegram login.

The checked-in `.env.example` contains variable names with empty values only.
Real values belong in the deployment secret manager and local untracked backend
environment files.

## System B — user Telegram identity

System B represents only the individual user. User Telegram authentication is
not enabled in this phase because no workflow currently requires it. If added
later, the integration must begin with an explicit backend API contract and the
operator-provided configuration required by that provider. No value may be
invented or hardcoded.

A verified user Telegram identity may establish or link an application identity.
It must never directly grant:

- administrator or operator access;
- premium/subscription status;
- storage channel access;
- trusted-device status;
- broadcast, update, analytics, or maintenance permissions; or
- any System A capability.

Every request still passes normal backend session validation, authorization,
ownership/subscription policy, input validation, and rate limiting.

## Data-flow invariants

```text
Flutter / browser
      |
      | HTTPS + signed application session
      v
TellyBase API (authn, authz, ownership, rate limits)
      |
      | private server-side capability
      v
System A Telegram infrastructure
```

There is no client-to-System-A edge. If System B is introduced, it terminates at
a dedicated identity adapter and produces only a normalized user identity claim;
it never exposes or receives a System A credential.

## Adding a credential-dependent feature

Stop implementation before adding code that depends on an unavailable secret.
Ask the operator for each exact environment variable name and explain its
backend-only purpose. Continue only after the operator supplies the required
configuration. Never place supplied values in source control, chat output,
client configuration, test fixtures, or build artifacts.

## Review checklist

- Does any client response contain an upstream URL, Telegram storage ID, channel
  ID, message ID, bot token, session, API hash, or phone number?
- Can any user-controlled value select a backend bot, channel, or API origin?
- Does a Telegram identity affect roles or subscriptions without an independent
  backend policy decision?
- Are admin APIs gated server-side on every request?
- Are all state-changing operations validated and rate-limited?
- Does `npm run security:client-secrets` pass?

A “yes” to either of the first three questions blocks release.

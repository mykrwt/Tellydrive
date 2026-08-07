# 🚀 GO-LIVE GUIDE — everything step by step (simple language)

This is the full "how do I actually run this?" guide for **TellyBase**.
It walks you from zero to a live website + working Android app + the
Telegram admin bot you use to manage everything.

> **The big picture first (read this):**
> Your app has 4 moving parts:
> 1. **The Website/Backend ("the server")** — a web app that stores all data
>    (users, files, releases) inside your own private Telegram channel.
> 2. **The Android app ("the APK")** — the app your users install.
> 3. **The Admin Bot (Telegram)** — the private bot *you* chat with to manage
>    everything (ban users, publish updates, see stats). It's your control panel.
> 4. **The Bridge** — a small program that connects the Admin Bot to the server.
>
> None of this is a real "cloud" — your data lives in your private Telegram
> channel, and only your bots can touch it.

---

## Step 0 — What you need before starting

- ☑️ A computer where you can run commands (this one works fine).
- ☑️ A Telegram account (for creating bots and the private channel).
- ☑️ A place to host the website (pick ONE — see Step 3).
- ☑️ About 30–45 minutes the first time.

---

## Step 1 — Create your Telegram stuff (bots + channel + numbers)

You need **2 bots** and **1 private channel**. Do this inside the Telegram app.

### 1.1 Create Bot #1 — the "Database Bot"
1. In Telegram, search for **@BotFather** (it's Telegram's official bot-maker).
2. Send it: `/newbot`
3. It will ask for a **name** — type anything, e.g. `TellyBase DB`.
4. It will ask for a **username** — must end in `bot`, e.g. `tellybase_db_bot`.
5. BotFather replies with a **token** — it looks like:
   `123456789:AAHflkajsdf...`
   ➡️ **Copy this token.** This is `TELEGRAM_BOT_TOKEN`. Keep it secret!

### 1.2 Create the private channel (your "database folder")
1. In Telegram, tap the menu (☰) → **New Channel**.
2. Name it anything, e.g. `TellyBase Private`. Make it **Private** (not public).
3. Add **Bot #1** (`tellybase_db_bot`) as an **Administrator** with these
   permissions ON: **Post Messages** and **Edit Channel Info**.
   (If it's a group: Settings → Administrators → add bot → check both.)
4. Find the channel's **numeric ID**:
   - Send any message inside the channel, then message **@getidsbot** and press
     the button to get the channel ID. It looks like `-1001234567890`.
   ➡️ **Copy this number.** This is `TELEGRAM_CHAT_ID`.

### 1.3 Create Bot #2 — the "Admin Bot" (your control panel)
1. Go back to **@BotFather**, send `/newbot` again.
2. Name it e.g. `TellyBase Admin`, username e.g. `tellybase_admin_bot`.
3. Copy its token too. ➡️ This is `TELEGRAM_ADMIN_BOT_TOKEN`.
4. Now find **your own Telegram user ID** (not the bot's):
   - Message **@userinfobot** (or @getidsbot) and it replies with your ID,
     a number like `123456789`.
   ➡️ This is `TELEGRAM_ADMIN_IDS`. (This is the ONLY person allowed to use
   the admin bot. Later you can add more IDs with commas: `111,222`.)

### 1.4 Generate 2 secret codes (like passwords for your server)
Run these two commands — each prints a long random code. Save them:

```bash
openssl rand -base64 32     # ➡️ this becomes SESSION_SECRET
openssl rand -hex 32        # ➡️ this becomes ADMIN_BOT_SHARED_SECRET
```

Write everything down somewhere safe. You now have:
| Name | What it is | From |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Database bot token | Step 1.1 |
| `TELEGRAM_CHAT_ID` | Private channel ID | Step 1.2 |
| `TELEGRAM_ADMIN_BOT_TOKEN` | Admin bot token | Step 1.3 |
| `TELEGRAM_ADMIN_IDS` | Your Telegram user ID | Step 1.3 |
| `SESSION_SECRET` | Random code | Step 1.4 |
| `ADMIN_BOT_SHARED_SECRET` | Random code | Step 1.4 |

---

## Step 2 — Host the website (pick ONE option)

The website is a **Next.js** app. It needs a computer/server that's always on
and can talk to Telegram. Pick whichever you're comfortable with:

### Option A — A VPS (simplest to understand, ~$5/month)
"VPS" = a rented computer in a data center that's always on.
Examples: DigitalOcean, Hetzner, Vultr, Linode. A $5 "Droplet"/"instance" is
enough.

1. Create a VPS with **Ubuntu 22.04/24.04**.
2. SSH into it (DigitalOcean shows you how).
3. Install Node.js 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```
4. Get your code on it:
   ```bash
   git clone https://github.com/mykrwt/Tellybase.git
   cd Tellybase
   npm install
   ```
5. Set your secret values (the table above):
   ```bash
   nano .env.local
   ```
   Paste this and fill in your real values (remove the `#` comments if you like):
   ```
   TELEGRAM_BOT_TOKEN=123456789:AAHflkajsdf...
   TELEGRAM_CHAT_ID=-1001234567890
   TELEGRAM_ADMIN_BOT_TOKEN=987654321:BBxyz...
   TELEGRAM_ADMIN_IDS=123456789
   SESSION_SECRET=<your random code>
   ADMIN_BOT_SHARED_SECRET=<your random code>
   ADMIN_EMAILS=you@example.com
   ```
   Save (Ctrl+O, Enter, Ctrl+X).
6. Start it:
   ```bash
   npm run build
   npm start
   ```
7. Point a domain at it (optional but recommended) with Nginx/Caddy, or just
   use the server's IP for now: `http://YOUR_SERVER_IP:3000`.

### Option B — Vercel / Railway / Render (no server management)
1. Push this repo to GitHub (already done).
2. **Vercel:** go to vercel.com → New Project → import `mykrwt/Tellybase`.
   Vercel will build and host it for free.
   ⚠️ The admin-bot bridge can't run on Vercel (needs a persistent process) — use webhook mode (Step 4) on Vercel; the bridge is ONLY for local dev.
3. Put the environment variables in the host's dashboard:
   - Vercel: Project → Settings → Environment Variables → add the 6 values.
   - Railway/Render: same idea, "Variables" tab.
4. Deploy. You get a URL like `https://tellybase.vercel.app`.

> **Every host gets the same env variables.** Vercel also lets you set
> `TELEGRAM_STORAGE_CHAT_ID` / `TELEGRAM_STORAGE_BOT_TOKEN` later if you want a
> separate channel for user files (optional — without them, files go in your
> main private channel).

---

## Step 3 — Make yourself an Admin account

1. Open your hosted website in a browser.
2. **Sign up** with your email + a password (8+ chars, letter + number).
3. Make that account an admin — pick ONE way:
   - **Easiest (no restart):** on the server (or locally):
     ```bash
     npm run make-admin -- you@example.com
     ```
     (run inside the repo with the same env values loaded)
   - **Or:** set `ADMIN_EMAILS=you@example.com` in the host's env vars and
     redeploy/restart.
4. Refresh the site — you'll see the **Admin** page. Done.

---

## Step 4 — Admin Bot delivery (webhook production / bridge local)

### Production (recommended — no bridge, no VPS)

Run ONE command after deploy (the bot must be configured with `TELEGRAM_ADMIN_BOT_TOKEN` and `ADMIN_BOT_SHARED_SECRET`):

```bash
npm run admin-bot:webhook -- https://your-site.example
```

Telegram pushes updates to `/api/admin-bot/webhook`; the site answers directly.
Before using the bridge locally, unset the webhook first (Telegram allows only one method):

```bash
npm run admin-bot:webhook-unset
```

### Local dev — bridge only

The bridge (`npm run admin-bot`) is ONLY for local development. It requires `npm run admin-bot:webhook-unset` first.

Keep it running in a separate terminal (your laptop or a tiny VPS). It must reach both Telegram and the backend (`ADMIN_BOT_API_URL`).

1. On that machine, in the repo:
   ```bash
   npm install
   ```
2. Create `.env.local` with the SAME values as the server, plus one extra:
   ```
   TELEGRAM_ADMIN_BOT_TOKEN=<from step 1.3>
   TELEGRAM_ADMIN_IDS=<your user id>
   ADMIN_BOT_SHARED_SECRET=<same code as server>
   ADMIN_BOT_API_URL=https://tellybase.vercel.app   # ← your hosted URL
   # (if hosted on a VPS at port 3000, use http://YOUR_SERVER_IP:3000)
   ```
   `ADMIN_BOT_SHARED_SECRET` must be **identical** on the server and the
   bridge — it's how the bridge proves to the server "I'm yours".
3. Start it:
   ```bash
   npm run admin-bot
   ```
   You should see: `[admin-bot] polling ... → ... (authorized ids: ...)`
4. Open Telegram, find **your admin bot** (e.g. `@tellybase_admin_bot`),
   press **Start**, send `/start`.
   You should get the menu: 📊 Statistics, 👥 Users, 🚀 Releases, etc.
   If it replies "Unauthorized", your `TELEGRAM_ADMIN_IDS` is wrong.

---

## Step 5 — Build the Android app (the APK)

1. Install **Flutter** (stable) + Android Studio with the Android SDK:
   - https://docs.flutter.dev/get-started/install
   - Run `flutter doctor` until Android toolchain says ✓.
2. In the repo, enter the app folder:
   ```bash
   cd tellybase_mobile
   flutter pub get
   ```
3. Build the app with your website's URL baked in:
   ```bash
   flutter build appbundle --release \
     --dart-define=API_BASE_URL=https://tellybase.vercel.app
   ```
   (`--dart-define=API_BASE_URL=...` is the ONLY thing you change per host —
   the app never contains Telegram tokens, those live on the server only.)
4. The output is at:
   `tellybase_mobile/build/app/outputs/bundle/release/app-release.aab`
5. To get an **APK** (for direct install/sharing) instead of AAB:
   ```bash
   flutter build apk --release --dart-define=API_BASE_URL=https://tellybase.vercel.app
   ```
   Output: `tellybase_mobile/build/app/outputs/flutter-apk/app-release.apk`
6. **Signing (for Play Store):** create a keystore ONCE, keep it safe forever:
   ```bash
   keytool -genkey -v -keystore ~/tellybase-upload.keystore \
     -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Then add a local `tellybase_mobile/android/key.properties` file (never
   commit it) with your keystore details — the build script reads it.

---

## Step 6 — Publish the app to your users (via the bot!)

This is the cool part — you publish updates from Telegram.

1. Open your **Admin Bot**, send `/apk`.
2. **Send the APK file** (the one from Step 5, `app-release.apk`).
   - Max size: 20 MB (Telegram's bot limit). If your APK is bigger, build a
     smaller one (e.g. `flutter build apk --release --split-per-abi` and send
     the `arm64-v8a` build) — most phones use arm64.
3. The bot asks for the version — type:
   `1.0.0 1 First release`
   (format: `versionName versionCode notes`)
4. Tap **🚀 Publish** on the release card.
5. Your app users now get the update: the app checks
   `/api/mobile/v1/app/state`, sees the new version, and downloads it through
   the server.

---

## Step 7 — Day-to-day admin (what the bot can do)

| You say / tap | It does |
|---|---|
| `/stats` | How many users, files, GB, premium accounts |
| `/analytics` | Signups per day, top users |
| `/users` | List users, tap one for their card |
| `/user bob@email.com` | Find one user |
| `/ban bob@email.com` / `/unban ...` | Block / unblock a user |
| User card → 💳 Premium | Give premium (7/30/90/365/custom days) |
| `/maintenance on` / `off` | Site shows "under maintenance" to everyone (you can still log in) |
| `/announce Hello!` | Show a message to all users in the app |
| `/logs` | See everything you did (audit trail) |

---

## Step 8 — Test checklist (before going public)

- [ ] `https://your-host` loads the landing page
- [ ] You can sign up + sign in
- [ ] You see the Admin page in the dashboard
- [ ] Admin bot replies to `/start` and `/stats` shows your 1 user
- [ ] Upload a file in the web dashboard → it appears in your private channel
- [ ] `/maintenance on` → sign out and try to log in → blocked with message
- [ ] `/announce test` → app/state shows it (visible in the app)
- [ ] APK published via bot → `/api/mobile/v1/app/state` shows the release
- [ ] Install the APK on a phone → it signs in to your hosted site

---

## Troubleshooting (simple fixes)

| Problem | Fix |
|---|---|
| "chat not found" on sign-up | `TELEGRAM_CHAT_ID` wrong. Make sure it starts with `-100` and the bot is an admin of that channel |
| "not enough rights to change chat info" | Re-add bot #1 to the channel with **Edit Channel Info** permission |
| Bot says "Unauthorized" | `TELEGRAM_ADMIN_IDS` doesn't include YOUR user id (check @userinfobot) |
| Bridge says "gateway rejected … 401" | `ADMIN_BOT_SHARED_SECRET` differs between server and bridge |
| App can't reach server | `API_BASE_URL` was baked at build time — rebuild the APK with the right URL |
| APK "exceeds 20 MB" | Build split-per-abi and send the arm64 APK, or host a local Bot API server |
| Forgot your password | An admin can't reset it from the bot yet — keep a note or re-create the account (data is private to you) |

---

## Secrets never to share

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_BOT_TOKEN`, `SESSION_SECRET`,
`ADMIN_BOT_SHARED_SECRET`, your channel ID — these live ONLY in your server
env + bridge `.env.local`. Never put them in the Flutter app, never prefix
with `NEXT_PUBLIC_`, never paste them into a public chat or commit.

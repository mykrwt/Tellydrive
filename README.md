# Tellybase

A modern, affordable cloud storage platform for images and videos (Version 1),
built to the Product Requirements Document in [`PRD.md`](PRD.md).

## What works

- **Authentication** via Clerk (sign up / sign in / sign out, sessions).
- **Upload center** — drag-and-drop, multi-file image/video uploads with live
  progress, stored through the Storage Manager.
- **Gallery / Library** — grid view, search, sort, filter, inline image/video
  preview.
- **Folders** — create, nest, rename, move and delete folders.
- **Recycle Bin** — restore or permanently delete files & folders, empty bin,
  configurable retention.
- **Storage usage** — per-user used / remaining / plan limit.
- **Subscriptions** — Free / Starter / Pro plans with pricing, quotas, max
  upload size; upgrade/downgrade from the UI.
- **Activity history** — every action is logged and viewable.
- **Admin dashboard** — analytics, user management (suspend/delete/change
  plan), plan CRUD, announcements, maintenance mode, recycle retention.
- **Storage Manager** — the only layer that talks to the storage backend.
  Ships with a **Telegram** backend (PRD Appendix B) and a local-disk fallback.

## Stack

- Next.js 16 (App Router), React 19, Tailwind CSS 4
- Clerk (auth)
- Node `node:sqlite` for metadata (users, files, folders, plans, activity)
- Abstracted Storage Manager (Telegram backend / local disk)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
```

Open http://localhost:3000.

**Authentication and Telegram keys are required.** See
[`SETUP.md`](SETUP.md) for step-by-step instructions on obtaining the Clerk
keys and the Telegram bot token / chat id.

## Architecture

```
UI (server components + client widgets)
      │
Business logic (lib/services) ──► SQLite metadata DB
      │
API routes (app/api) ───────────► Storage Manager (lib/storage)
                                     ├── Telegram backend
                                     └── Local disk backend (dev fallback)
```

- Business logic never talks to the storage backend directly — everything goes
  through the Storage Manager, so the backend can be swapped without rewriting
  the app (PRD §12, Appendix B).
- No secrets (Clerk secret key, Telegram bot token) ever reach the browser.
- Auth is always Clerk — the app never implements its own authentication.

## Notes

- For local dev, `STORAGE_BACKEND=auto` uses Telegram when tokens are set and
  local disk otherwise.
- The local backend and SQLite metadata database use the server filesystem, so
  for production on serverless hosts you should configure the Telegram backend
  (or another persistent backend behind the Storage Manager).

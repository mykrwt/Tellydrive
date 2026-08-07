# Backend authority model

The backend is the only trusted authority. Flutter, browsers, cookies, request
bodies, cached values, and APK/UI state are untrusted inputs.

## Request flow

Every protected API calls `authorizeRequest()` from
`lib/backend-authority.ts` before reading or mutating protected data. The
backend re-loads the signed session identity and evaluates persisted account and
system policy for the requested action.

```text
untrusted client request
        |
        v
signed session verification
        |
        v
backend account + system policy
        |
        +-- account active?
        +-- maintenance allowed?
        +-- storage enabled?
        +-- subscription entitlement active?
        +-- admin role required?
        |
        v
ownership checks + validation + rate limits
        |
        v
backend operation
```

A valid cookie only identifies a candidate account. It does not establish that
the account is active, subscribed, permitted to use storage, or authorized for
the requested operation.

## Persisted authority

Authority fields live in the private backend account database:

- `accountStatus`: `active`, `suspended`, or `banned`;
- `storageAccess`: `enabled` or `disabled`;
- `subscription`: backend-owned tier, status, expiration, and update time;
- `role`: backend-owned user/admin role; and
- `system.maintenance`: global backend maintenance state and public message.

Old accounts are normalized server-side to active/free/storage-enabled for
backward compatibility. New accounts receive those backend defaults at
registration. Clients cannot write these fields through normal profile or
storage APIs.

Administrators can update account authority through the protected
`PATCH /api/mobile/v1/admin/users/:id` API. Maintenance mode is controlled by
`PATCH /api/mobile/v1/admin/system`. Both require a currently active backend
admin principal and have administrative rate limits. An administrator cannot
revoke their own role, ban/suspend themselves, or disable their own storage
through these APIs.

## Action policy

`authorizeRequest()` recognizes explicit actions:

- `account:read`
- `storage:read`
- `storage:write`
- `storage:upload`
- `storage:download`
- `premium:use`
- `admin:read`
- `admin:write`

Storage and admin APIs use the narrowest action applicable. Premium features
must call `premium:use`; displaying a premium badge in Flutter is not an
entitlement check.

## Upload authority

Upload metadata from a client is never authoritative.

1. The part endpoint validates the current backend principal and derives the
   allowed source, target folder, file type policy, and maximum size.
2. The backend seals the approved name, MIME type, total size, part count,
   source, folder, owner, and internal storage references with AES-256-GCM.
3. Finalization ignores client-supplied names, MIME types, sizes, folders,
   `allowAny`, and source claims. It accepts only matching sealed grants and
   re-evaluates current account/admin/storage policy before saving.

A modified client therefore cannot turn a gallery upload into an unrestricted
or administrative upload, switch owners/folders, increase limits, or finalize
another account's parts.

## Maintenance, bans, and sessions

- Non-admin requests fail with `503` while maintenance mode is active.
- Banned and suspended accounts fail before protected data access.
- Admins may operate during maintenance, but banned/suspended admins may not.
- Sign-in checks current authority before creating a session.
- Sign-up is disabled during maintenance.
- Sign-out remains available in every state.
- Middleware cookie checks are only an inexpensive cryptographic prefilter;
  server pages and APIs perform the real authority evaluation.

## Flutter contract

The mobile session response may include account/subscription/entitlement values
for display. Flutter must treat them as hints. Every operation is still checked
against the latest backend state, so stale secure storage, modified local data,
or a modified APK cannot grant access.

Only the backend API origin is compiled into Flutter. No authority policy,
subscription decision, ban override, maintenance bypass, storage credential, or
premium unlock key exists in the application.

## Verification

Run:

```bash
npm run security:backend-authority
npm run build
```

The boundary check also fails when an API route lacks a backend authority gate,
a client imports authority/private Telegram modules, file APIs redirect to
private storage, or upload grants are no longer authenticated-encrypted.

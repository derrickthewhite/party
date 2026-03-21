# Party: Minimal Online Game Framework

This project is a lightweight foundation for browser-based multiplayer games.

- Frontend: static HTML + vanilla JavaScript
- Backend: minimal PHP REST API
- Database: MySQL (db name: `u709836584_party`)
- Auth: cookie session + invite-key-gated signup
- Chat: per-game polling transport (easy to replace later)

## Project Layout

- `index.html` static app shell at the web root
- `js/` frontend JavaScript modules
- `api/` REST entrypoint, route handlers, shared helpers
- `sql/` schema, seed, cleanup, and full reset scripts

## Quick Start

1. Create/import database schema and seed:
1. Import `sql/001_schema.sql`
2. Import `sql/002_seed.sql`

2. Set API DB credentials as environment variables where possible:
- `PARTY_DB_HOST`
- `PARTY_DB_PORT`
- `PARTY_DB_NAME`
- `PARTY_DB_USER`
- `PARTY_DB_PASS`
- Optional: `PARTY_ALLOW_ORIGIN` (default `*`)
- Optional: `PARTY_DEBUG=1` for detailed server errors

3. Serve project root with PHP-enabled web server.
4. Open `index.html`.

## API Overview

Base path: `/api`

### Auth

- `POST /api/auth/signup`
  - body: `{ "username": "...", "salt": "<hex>", "verifier": "<hex>", "invite_key": "..." }`
- `POST /api/auth/signin/start`
  - body: `{ "username": "..." }`
  - response: `{ "salt": "<hex>", "server_public": "<hex>", "params": { ... } }`
- `POST /api/auth/signin/finish`
  - body: `{ "username": "...", "client_public": "<hex>", "client_proof": "<hex>" }`
- `POST /api/auth/signout`
- `GET /api/auth/me`
- `GET /api/auth/test`

Notes:
- `signup` creates the account only. It does not auto-signin.
- `me` returns `401` until `signin` succeeds and sets a session cookie.
- During current debugging phase, auth endpoints include extra error metadata under `meta`.

### Games

- `GET /api/games`
- `POST /api/games`
  - body: `{ "title": "...", "game_type": "chat|mafia|diplomacy|rumble" }`
- `POST /api/games/{id}/join`
- `POST /api/games/{id}/observe`
- `POST /api/games/{id}/start`
- `POST /api/games/{id}/end`
- `POST /api/games/{id}/delete`
- `GET /api/games/{id}`

### Chat

- `GET /api/games/{id}/messages?since_id=0`
- `POST /api/games/{id}/messages`
  - body: `{ "body": "..." }`

Lifecycle rules:
- before start (`open`): chat is allowed, game actions are blocked
- in progress (`in_progress`): chat and game actions allowed for active non-observer members
- ended (`closed`): read-only, no joins/chat/actions

### Actions (Extensible Infrastructure)

- `GET /api/games/{id}/actions?since_id=0`
- `POST /api/games/{id}/actions`
  - body: `{ "action_type": "...", "payload": { ... } }`
- `POST /api/games/{id}/actions/reveal` (diplomacy owner force reveal)

Notes:
- observers can read but cannot chat or submit actions
- diplomacy orders stay hidden until reveal

## Signup Invite Key

The active signup key is stored in `app_settings` under `signup_invite_key`.

Rotate it at any time:

```sql
USE `u709836584_party`;
UPDATE `app_settings`
SET `setting_value` = 'new-secret-key'
WHERE `setting_key` = 'signup_invite_key';
```

## Auth Diagnostics Endpoint

Use `GET /api/auth/test` to quickly verify auth subsystem health.

The response includes:
- request method/URI/timestamp
- database connectivity check
- `signup_invite_key` configuration status (masked preview + length)
- session state and cookie presence
- current authenticated user (if any)

This endpoint is currently always enabled for troubleshooting and should be restricted or removed before production hardening.

## SQL Workflow (phpMyAdmin Friendly)

### Initial setup

1. Import `sql/001_schema.sql`
2. Import `sql/002_seed.sql`

### Existing database auth migration

1. Import `sql/012_migrate_to_srp_auth.sql`
2. Recreate users via signup (existing users are invalidated by this migration)

### Existing database game-system migration

1. Import `sql/013_update_multi_type_games.sql`
2. This migration is idempotent and upgrades existing installs with:
- observer membership role
- admin user flag for delete permission
- game state/action/hidden role tables
- legacy `generic` game type normalized to `chat`

### Clean chat only

1. Import `sql/010_cleanup_messages.sql`

### Remove closed games (and related members/messages)

1. Import `sql/011_cleanup_inactive_games.sql`

### Full rebuild

1. Import `sql/099_full_reset.sql`

## Security Notes

- Passwords are never posted directly to the API. Auth uses SRP-style verifier/challenge proof exchange.
- The server stores only `srp_salt` and `srp_verifier` for authentication.
- Session ID is regenerated on signin.
- API uses prepared statements (PDO) for SQL operations.
- Game chat endpoints require membership in the game.
- HTTPS is required for auth endpoints in all environments.
- PHP `gmp` extension is required for SRP arithmetic in the API.
- Keep `PARTY_DEBUG` off in production.

## Known v1 Limits

- No WebSocket server in shared-hosting profile (chat uses polling).
- No password reset/email flows.
- No account lockout/rate limiting table yet.
- Full Mafia/Diplomacy/Rumble round-resolution engines are still being implemented on top of the new action infrastructure.

## Hosting: 

- site is currently hosted on https://party.derrickthewhite.com

## DB Troubleshooting (Shared Hosting)

If `GET /api/auth/test` reports MySQL access denied (for example `root@127.0.0.1`), PHP is not receiving your intended DB credentials.

The API now reads DB settings from any of these keys:
- `PARTY_DB_HOST` (fallback: `DB_HOST`)
- `PARTY_DB_PORT` (fallback: `DB_PORT`)
- `PARTY_DB_NAME` (fallback: `DB_NAME`)
- `PARTY_DB_USER` (fallback: `DB_USER`)
- `PARTY_DB_PASS` (fallback: `DB_PASS`)

After setting values in your host panel (or server config), call `GET /api/auth/test` and confirm:
- `report.effective_config.db.user` is your hosting DB user (not `root`)
- `report.effective_config.db.password_set` is `true`
- `report.checks.database.ok` is `true`

## Detailed DB Credential Setup

This section gives the exact order to set DB credentials for this API.

### Step 1: Create app DB user (preferred, least privilege)

Option A (if your MySQL account can run user-grant SQL):
1. Open phpMyAdmin.
2. Select the `u709836584_party` database.
3. Open SQL tab.
4. Run `sql/003_create_app_db_user.sql` after replacing `REPLACE_WITH_STRONG_PASSWORD`.

Option B (shared hosting typical path):
1. Open your hosting control panel.
2. Create a MySQL user.
3. Assign that user to database `u709836584_party`.
4. Grant privileges: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.

Option C (used live)
1. Use the singleton root user (required by hostinger)

Use these values after creation:
- DB host: your host panel value (often `localhost`)
- DB port: `3306` unless host says otherwise
- DB name: `u709836584_party`
- DB user: the user you just created/assigned
- DB password: the password you set for that user

### Step 2: Store credentials in PHP (raw file method)

1. Copy `api/config.local.php.example` to `api/config.local.php`.
2. Edit `api/config.local.php` and set real DB values.
3. Keep this file private (it is git-ignored by `.gitignore`).

The API load order is:
1. Environment variables (`PARTY_DB_*` then `DB_*`)
2. `api/config.local.php` overrides (if present)

### Step 3: Verify from API diagnostics

Call `GET /api/auth/test` and check:
- `report.effective_config.db.host` matches your host panel host
- `report.effective_config.db.user` matches your app DB user
- `report.effective_config.db.password_set` is `true`
- `report.checks.database.ok` is `true`

If still failing:
- If error shows `using password: NO`, your password field is blank or not loaded.
- If error shows unknown user, user was not created/assigned for that host.
- If error shows access denied with password YES, password is wrong or grants missing.
- If host differs from panel value, update `db.host` in `api/config.local.php`.
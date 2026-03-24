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

## Routing And Auth UX

- The frontend uses query parameters on `index.html` to restore app state on reload.
- Supported parameters:
  - `screen=welcome|signup|signin|landing|game`
  - `game=<id>` to reopen a selected game
  - `next=<same-origin-path-or-hash>` to continue to a safe internal target after sign-in
- Signup redirects to the sign-in screen after account creation.
- Sign-in prefers reopening the target game from `game=<id>` before falling back to `next=`.
- Usernames are treated case-insensitively during sign-in by using the canonical stored username for the SRP handshake.
- Username and password fields now set `autocomplete` hints so browsers can offer credential saving. This is best-effort and still depends on browser and site security context.

### Manual checks

1. Open `index.html?screen=signup` and verify the signup screen shows.
2. Open `index.html?screen=game&game=1`, sign in, and verify the same game reopens.
3. Create an account, then verify the app moves to the sign-in screen.
4. Sign in with a different username casing than the account was created with and verify authentication still succeeds.
5. Confirm the browser offers to save credentials on sign-in or signup.

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
- `POST /api/games/{id}/actions/rumble-order`
  - body: `{ "attacks": { "<target_user_id>": <amount>, ... } }`
- `POST /api/games/{id}/actions/rumble-order/cancel`

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

### Existing database rumble-state migration

1. Import `sql/014_add_rumble_player_state.sql`
2. This migration is idempotent and adds rumble player health state storage and backfill.

### Existing database rumble-abilities migration

1. Import `sql/015_add_rumble_abilities_state.sql`
2. This migration is idempotent and adds persistent rumble ability ownership state.

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

## Game Rules (Site-Specific)

This section documents the intended game rules and current site behavior for each game type.

### Shared game model (all game types)

- Every game has a lifecycle status: `open`, `in_progress`, `closed`.
- Before start (`open`): chat is allowed, game actions are blocked.
- In progress (`in_progress`): chat and game actions are allowed for active non-observer members (subject to game-type rules).
- Ended (`closed`): read-only; no new joins, chat, or game actions.
- Owner/admin controls:
  - Start, End, Delete are available in lobby and game view.
  - Delete is hard-delete (game row and dependent data removed via cascade).
- Observers:
  - Can join as observer.
  - Can read state/chat/revealed game data.
  - Cannot submit chat messages or game actions.
- Membership UX:
  - Lobby Join and Observe buttons are disabled for users already in the game.

### Chat game (`chat`)

Purpose:
- Baseline social game/chat room model and shared infrastructure anchor.

Rules for this site:
- Uses the regular game lifecycle and membership rules above.
- Uses chat feed and owner/admin lifecycle controls.
- Type-specific action composer is hidden for this game view.

### Stub game (`stub`)

Purpose:
- Development placeholder for rapid prototyping and experimenting with future game behavior.

Rules for this site:
- Uses the existing generic/base game interface exactly as-is.
- Includes generic action composer controls.
- Stub is a front-end admin-only create option to avoid lobby clutter.
- Once created, Stub games are visible/joinable by everyone using normal membership rules.

### Diplomacy game (`diplomacy`)

Purpose:
- Focused on hidden order submission and synchronized reveal.

Rules for this site:
- Players submit free-text orders as action type `order`.
- Submitted orders remain hidden until reveal.
- Reveal behavior:
  - Automatic reveal when all required non-observer participants have submitted for the round.
  - Owner/admin can force reveal using End Turn.
- End Turn behavior:
  - Allowed for owner/admin.
  - Reveals unrevealed orders for current round and advances round.
- Diplomacy view UI:
  - Order text input.
  - Send Order button.
  - End Turn button.
  - List of revealed orders from the previous round.
- Observers can see revealed previous-round orders.

### Mafia game (`mafia`)

Purpose:
- Hidden-team elimination game with day/night cadence.

Intended rules for this site (target behavior):
- At game start, some players are assigned as mafia privately.
- Phases:
  - Day: public discussion and voting to eliminate a player.
  - Night: mafia selects a target to eliminate.
- Eliminated players remain as read-only participants (observer-like).
- Win conditions:
  - Town wins when all mafia are eliminated.
  - Mafia wins when mafia are majority among living players.

Determinism policy:
- Tie outcomes that require random choice should use deterministic replay-safe pseudo-random selection based on stable game/round seed inputs.

Current implementation status:
- Role assignment scaffolding exists.
- Full day/night resolution flow and elimination pipeline are still in progress.

### Rumble game (`rumble`)

Purpose:
- Simultaneous allocation combat game with shrinking power from damage.

Intended rules for this site (target behavior):
- Two phases conceptually exist:
  - Bidding phase (placeholder for future use).
  - Battle phase (primary v1 focus).
- Each player starts with 100 health.
- Each round, available power equals current health.
- Players allocate power across attacks (including self-attack allowed) and defense.
- Round resolution is simultaneous.
- Damage taken = `max(0, incoming_attacks - defense)`.
- Health reduced to `0` or below means elimination.
- Lower health next round means lower power next round.
- End conditions:
  - One player remains alive, or
  - Draw if all remaining players reach `0` in the same resolution.

Current implementation status:
- Infrastructure and type routing are present.
- Full battle resolver and round loop logic are still in progress.

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
# Party: Technical Notes

This document contains technical and deployment details intended for developers and maintainers. For the public-facing project overview, see `README.md`.

## Local Host Mode

The repo includes a Node host layer that can run the app in place while preserving the PHP backend.

- Public host: Node serves `index.html`, `styles.css`, and `js/`
- API host: Node starts PHP locally and proxies `/api`
- Default local database: SQLite stored under `data/party.sqlite`
- Optional database mode: MySQL by setting `PARTY_DB_DRIVER=mysql` and the existing DB env vars

### Local start

1. Put a portable Windows PHP build at `runtime/php/windows/php.exe`, or set `PARTY_PHP_BIN` to a PHP executable.
2. Make sure the PHP build includes `pdo_sqlite`, `sqlite3`, `pdo_mysql`, `openssl`, `json`, and `gmp`.
3. Run `npm start`.
4. Open `http://127.0.0.1:8080`.

Notes:
- No PHP or MySQL system install is required for the default SQLite mode.
- System Node is still required.
- Local host mode disables the API HTTPS requirement for the spawned PHP process by setting `PARTY_AUTH_ENFORCE_HTTPS=0`.
- Repo-local writable paths are `data/party.sqlite` and `data/sessions/`.

### Local E2E tests

The repo includes a Playwright end-to-end harness for the live local server.

1. Install Node.js and npm if they are not already available.
2. Run `npm install`.
3. Run `npm run e2e:install` once to install the Playwright Chromium browser.
4. Run `npm run e2e`.

Notes:
- The E2E suite starts and stops the local Node + PHP host automatically.
- Test runs use a disposable SQLite database and session directory under `.tmp/e2e/`.
- For interactive debugging, use `npm run e2e:headed` or `npm run e2e:debug`.

## API Overview

Base path: `/api`

### Auth

- `POST /api/auth/signup` — body: `{ "username": "...", "salt": "<hex>", "verifier": "<hex>", "invite_key": "..." }`
- `POST /api/auth/signin/start` — body: `{ "username": "..." }` → response: `{ "salt": "<hex>", "server_public": "<hex>", "params": { ... } }`
- `POST /api/auth/signin/finish` — body: `{ "username": "...", "client_public": "<hex>", "client_proof": "<hex>" }`
- `POST /api/auth/signout`
- `GET /api/auth/me`
- `GET /api/auth/test`

Notes:
- `signup` creates the account only (does not auto-signin).
- `me` returns `401` until `signin` succeeds and sets a session cookie.
- Auth uses SRP-style verifier/challenge proof exchange; the server stores only `srp_salt` and `srp_verifier`.

### Games

- `GET /api/games`
- `POST /api/games` — body: `{ "title": "...", "game_type": "chat|mafia|diplomacy|rumble" }`
- `POST /api/games/{id}/join`
- `POST /api/games/{id}/observe`
- `POST /api/games/{id}/start`
- `POST /api/games/{id}/end`
- `POST /api/games/{id}/delete`
- `GET /api/games/{id}`

### Chat

- `GET /api/games/{id}/messages?since_id=0`
- `POST /api/games/{id}/messages` — body: `{ "body": "..." }`

Lifecycle rules:
- before start (`open`): chat allowed, game actions blocked
- in progress (`in_progress`): chat and game actions allowed for active non-observer members
- ended (`closed`): read-only; no joins/chat/actions

### Actions

- `GET /api/games/{id}/actions?since_id=0`
- `POST /api/games/{id}/actions` — body: `{ "action_type": "...", "payload": { ... } }`
- `POST /api/games/{id}/actions/reveal` (diplomacy owner force reveal)
- `POST /api/games/{id}/actions/rumble-order` — body: `{ "attacks": { "<target_user_id>": <amount>, ... } }`
- `POST /api/games/{id}/actions/rumble-order/cancel`

Notes:
- observers can read but cannot chat or submit actions
- diplomacy orders stay hidden until reveal

## SQL Workflow

### Initial setup

1. Import `sql/001_schema.sql`
2. Import `sql/002_seed.sql`

### Migrations and maintenance

- `sql/012_migrate_to_srp_auth.sql` — migrate existing auth to SRP
- `sql/013_update_multi_type_games.sql` — add observer membership, admin flags, normalized game types
- `sql/014_add_rumble_player_state.sql` — add rumble player health state
- `sql/015_add_rumble_abilities_state.sql` — add rumble ability ownership state
- `sql/018_rumble_ability_catalog_tables.sql` — add rumble ability catalog
- `sql/010_cleanup_messages.sql` — clean chat only
- `sql/011_cleanup_inactive_games.sql` — remove closed games and related data
- `sql/099_full_reset.sql` — full rebuild/reset

## Hosting & Deployment

Hosting: site is currently hosted on https://party.derrickthewhite.com

### Deploying with GitHub Actions (FTP)

Repository includes a workflow that deploys frontend + `api/` PHP files to Hostinger via `SamKirkland/FTP-Deploy-Action@v4`.

Required repository secrets:
- `FTP_HOST` — Host/IP
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `FTP_TARGET` — remote folder (e.g., `public_html`)

Notes:
- The workflow excludes `api/config.local.php` — create/update host config manually after deploy.
- Test to a staging folder before deploying to production.

CLI alternative for secrets (requires `gh`):
```
gh secret set FTP_HOST -b"145.223.77.60"
gh secret set FTP_USERNAME -b"u709836584.derrickthewhite.com"
gh secret set FTP_TARGET -b"public_html/staging"
gh secret set FTP_PASSWORD -b"<your-strong-password>"
```

### Manual deploy helpers

If desired, add `scripts/deploy-local.sh` or `scripts/deploy.ps1` for manual deploys. Do not include credentials in those scripts.

## DB Troubleshooting

If `GET /api/auth/test` reports MySQL access denied (for example `root@127.0.0.1`), PHP may not be receiving your intended DB credentials.

The API reads DB settings from these keys (in order):
- `PARTY_DB_HOST` (fallback: `DB_HOST`)
- `PARTY_DB_PORT` (fallback: `DB_PORT`)
- `PARTY_DB_NAME` (fallback: `DB_NAME`)
- `PARTY_DB_USER` (fallback: `DB_USER`)
- `PARTY_DB_PASS` (fallback: `DB_PASS`)

Verify via `GET /api/auth/test` that `report.effective_config.db.user` and `report.checks.database.ok` are correct.

## Detailed DB Credential Setup

### Step 1: Create app DB user

Option A (SQL-capable): run `sql/003_create_app_db_user.sql` after replacing the password placeholder.

Option B (shared hosting): create a MySQL user via hosting panel and assign it to `u709836584_party` with limited privileges.

Option C (live/host constraints): use singleton root user only if required by host.

### Step 2: Store credentials

1. Copy `api/config.local.php.example` to `api/config.local.php`.
2. Edit and set real DB values (this file is git-ignored).

Load order:
1. Environment variables (`PARTY_DB_*`, then `DB_*`)
2. `api/config.local.php` overrides (if present)

### Step 3: Verify

Call `GET /api/auth/test` and confirm effective config and DB checks.

## Security Notes

- Passwords are never posted directly — SRP verifier/proof exchange is used.
- Session ID is regenerated on signin.
- API uses prepared statements (PDO).
- HTTPS is required for auth endpoints in production.
- PHP `gmp` extension is required for SRP arithmetic.
- Keep `PARTY_DEBUG` off in production.

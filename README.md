# Party: Minimal Online Game Framework

This project is a lightweight foundation for browser-based multiplayer games. It uses a static frontend and a minimal PHP REST API backend. For developer-facing setup, local hosting, deployment, and database details see `TECHNICAL.md`.

Highlights:

- Frontend: static HTML + vanilla JavaScript
- Backend: PHP REST API
- Auth: SRP-style verifier/proof exchange (server stores `srp_salt` and `srp_verifier`)

## Project Layout

- `index.html` — static app shell
- `js/` — frontend JavaScript modules
- `api/` — REST entrypoint, route handlers, shared helpers
- `sql/` — schema, seed, cleanup, and reset scripts
- `server/` — Node host, SQLite bootstrap, and PHP router scripts

## Quick Start (developer)

1. Run `npm install`.
2. For local run, place a portable PHP at `runtime/php/windows/php.exe` or set `PARTY_PHP_BIN`.
3. Run `npm start` and open `http://127.0.0.1:8080`.

## Backend API Tests

Run `npm run test:api` to execute direct backend integration tests against the real local PHP API without launching a browser.

The API test harness:

- boots the normal local server stack from `server/index.js`
- creates a disposable SQLite database under `.tmp/api-tests/current`
- isolates PHP session files under `.tmp/api-tests/current/sessions`
- exercises the HTTP API directly for auth and core game flows

For full local host setup, backend API testing, deployment, and DB credential workflows, see `TECHNICAL.md`.

## Routing and Auth UX

- The frontend uses query parameters on `index.html` to restore app state: `screen=welcome|signup|signin|landing|game`, `game=<id>`, `next=<path|hash>`.
- Signup redirects to sign-in. Sign-in attempts to reopen `game=<id>` before falling back to `next=`.
- Usernames are case-insensitive for sign-in; the canonical stored username is used for SRP.

### Manual checks

1. Open `index.html?screen=signup` and verify the signup screen.
2. Open `index.html?screen=game&game=1`, sign in, and verify the game reopens.

## Game Types and Rules

Supported `game_type`s: `chat`, `mafia`, `diplomacy`, `rumble` — see in-app UI for type-specific controls. Detailed rules and intended behavior are documented in this README and `TECHNICAL.md`.

## Contributing & Security

- Keep `PARTY_DEBUG` off in production.
- Use the SRP auth endpoints and avoid storing plaintext passwords.

---

Developer and deployment details moved to: [TECHNICAL.md](TECHNICAL.md)

If you want, I can also add a short `scripts/deploy-local.sh` or `deploy.ps1` for local manual deploys (it will not contain credentials). 

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
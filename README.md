# Party: Minimal Online Game Framework

This project is a lightweight foundation for browser-based multiplayer games.

- Frontend: static HTML + vanilla JavaScript
- Backend: minimal PHP REST API
- Database: MySQL (db name: `u709836584_party`)
- Auth: cookie session + invite-key-gated signup
- Chat: per-game polling transport (easy to replace later)

## Project Layout

- `public/` static app shell and JS modules
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
4. Open `public/index.html`.

## API Overview

Base path: `/api`

### Auth

- `POST /api/auth/signup`
  - body: `{ "username": "...", "password": "...", "invite_key": "..." }`
- `POST /api/auth/signin`
  - body: `{ "username": "...", "password": "..." }`
- `POST /api/auth/signout`
- `GET /api/auth/me`

### Games

- `GET /api/games`
- `POST /api/games`
  - body: `{ "title": "...", "game_type": "generic" }`
- `POST /api/games/{id}/join`
- `GET /api/games/{id}`

### Chat

- `GET /api/games/{id}/messages?since_id=0`
- `POST /api/games/{id}/messages`
  - body: `{ "body": "..." }`

## Signup Invite Key

The active signup key is stored in `app_settings` under `signup_invite_key`.

Rotate it at any time:

```sql
USE `u709836584_party`;
UPDATE `app_settings`
SET `setting_value` = 'new-secret-key'
WHERE `setting_key` = 'signup_invite_key';
```

## SQL Workflow (phpMyAdmin Friendly)

### Initial setup

1. Import `sql/001_schema.sql`
2. Import `sql/002_seed.sql`

### Clean chat only

1. Import `sql/010_cleanup_messages.sql`

### Remove closed games (and related members/messages)

1. Import `sql/011_cleanup_inactive_games.sql`

### Full rebuild

1. Import `sql/099_full_reset.sql`

## Security Notes

- Passwords are hashed using `password_hash` and verified with `password_verify`.
- Session ID is regenerated on signin.
- API uses prepared statements (PDO) for SQL operations.
- Game chat endpoints require membership in the game.
- Use HTTPS in production so cookie `Secure` behavior is effective.
- Keep `PARTY_DEBUG` off in production.

## Known v1 Limits

- No WebSocket server in shared-hosting profile (chat uses polling).
- No password reset/email flows.
- No account lockout/rate limiting table yet.
- Generic game model only (no game-specific rules schema yet).

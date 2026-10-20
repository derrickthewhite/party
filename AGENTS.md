# Agent UI Architecture Rules

These rules are mandatory for all JavaScript UI changes in this repository.

## STOP — Vendored Diplomacy board (`diplomacy/board`, `diplomacy/maps`)

**Do not edit, patch, generate into, or “just quickly fix” anything under `diplomacy/board/` or `diplomacy/maps/`.**

Those directories are a copy from a separate vendor project. This app only mounts `DiplomacyBoard`. If a bug or feature lives in board JS/CSS, map graphs, SVGs, token JSON, or board assets:

1. **Stop.** Do not change those files in this repo.
2. **Ask** whether to write a vendor handoff package (zip + goals) instead.
3. Put host-only work in `js/`, `api/`, `server/`, etc.
4. After the vendor ships, replace this copy — do not merge by editing the copy in place.

“Downloadable instructions for board” means a package **the vendor implements**. It is not a changelog written after you already patched `diplomacy/board`.

An approved plan that lists `diplomacy/board` or `diplomacy/maps` files to edit is **invalid**. Stop and ask; do not implement it.

See `diplomacy/README.md`.

## Retained DOM Model

1. Mount once:
- Build screen structure once during screen creation.
- Keep stable node references in registries keyed by domain id.

2. Split state:
- Keep `serverSnapshot` for server truth.
- Keep `localDraft` for unsaved user input.
- Keep UI flags (`busy`, `editing`, `dirty`) separate.

3. Reconcile updates:
- Update existing nodes in place (`textContent`, `value`, `disabled`, `style.display`).
- Add/remove keyed rows only when entity set changes.
- Reorder by appending existing nodes in desired order; do not recreate unchanged rows.

4. Transition-only draft resets:
- Only reset draft on explicit transitions: round change, submit success, cancel success, or explicit reset action.
- Poll/refresh must never erase dirty local draft for the current round.

5. Refresh safety:
- Refresh functions may update snapshot state and call reconcile.
- Refresh functions must not clear list containers or overwrite draft unconditionally.

## Forbidden Patterns In Update/Refresh Paths

- `clearNode(dynamicContainer)`
- `dynamicContainer.innerHTML = ...`
- Rebuilding whole list rows on each poll
- Assigning draft state from server snapshot on every refresh

## Required Review Checklist

- Unsaved input survives auto-refresh in same round.
- Focused input remains usable after refresh.
- Round advance applies new server state and resets draft intentionally.
- Screen updates are keyed and mutation-based, not rebuild-based.
- Ask clarifying questions aggressively rather than guessing when requirements or product behavior are ambiguous.
- Never encode gameplay constants or business rules behind specific ability ids in UI code. Use DB-backed template data, tags, and structured metadata instead; if the data model cannot support the behavior cleanly, stop and ask rather than hard-code it.

## SQL Migration Consistency Rule

- When adding a new SQL update/migration script in `sql/` (for example `0xx_*.sql`), also update `sql/001_schema.sql` and `sql/099_full_reset.sql` so fresh and reset installs include the same schema/state.

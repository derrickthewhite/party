# Agent UI Architecture Rules

These rules are mandatory for all JavaScript UI changes in this repository.

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

## SQL Migration Consistency Rule

- When adding a new SQL update/migration script in `sql/` (for example `0xx_*.sql`), also update `sql/001_schema.sql` and `sql/099_full_reset.sql` so fresh and reset installs include the same schema/state.

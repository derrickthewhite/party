# Frontend Browser Test Philosophy

This directory holds presentation-first browser tests for the Party UI.

## Goal

These tests exist to prove that the real application shows the right information and controls to a user, at the right time, with acceptable layout behavior. They are not primarily white-box unit tests and they are not driven by code coverage targets.

## What To Assert

- Assert visible buttons, labels, summaries, empty states, and read-only states.
- Assert that on-screen values match live server responses from list, detail, message, and action endpoints.
- Assert the currently used game states, including `open`, active game phases, observer restrictions, and `closed` read-only presentation.
- Assert layout behavior where it matters to a user: no accidental page overflow, and contained scrolling where overflow is intentional.

## What To Avoid

- Avoid asserting internal implementation details when a user-visible assertion is available.
- Avoid testing private helpers or DOM mutation mechanics here.
- Avoid snapshotting entire pages when a smaller behavior check is clearer.
- Avoid synthetic fixtures that bypass the real HTTP API when normal server setup can create the state.

## Authoring Rules

- Prefer one spec file per surface so failures are easy to find and maintain.
- Reuse the shared browser and API fixtures in `e2e/support/`.
- Seed test state through the disposable server harness and real API endpoints.
- Use stable DOM anchors such as `data-ref` where available, but keep assertions centered on user-visible outcomes.
- When adding a new game state or major UI surface, add or update browser coverage in the matching per-surface spec.

## Current Surface Split

- `lobby-ui.test.js`
- `chat-ui.test.js`
- `diplomacy-ui.test.js`
- `mafia-ui.test.js`
- `rumble-ui.test.js`
- `admin-ui.test.js`
- `browser-smoke.test.js`
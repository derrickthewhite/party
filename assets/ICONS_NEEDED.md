# Icon Requirements

This document lists all icons needed to represent UI states and button choices for the landing page and the Mafia screen.

## Global / Shared
- Icon: `spinner` — Loading state for buttons and refresh actions (small).
- Icon: `success` — Operation success (toast/status).
- Icon: `error` — Operation error (toast/status).
- Icon: `info` — Informational messages.
- Icon: `warning` — Warnings or confirmations.
- Icon: `chevron-right` / `chevron-down` — Expand/collapse or navigation.
- Icon: `ellipsis` — More/options overflow.
- Icon: `user-avatar-placeholder` — Default avatar when no icon assigned.

## Landing / Lobby
- Action: `admin-toggle-on` / `admin-toggle-off` — Admin UI on/off toggle.
- Action: `refresh` — Refresh the lobby / game lists.
- Action: `sign-out` — Sign out button.
- Action: `create-game` — Create game button (primary).
- Control: `select-game-type` — icon set for game types:
  - `game-type-chat`
  - `game-type-mafia`
  - `game-type-diplomacy`
  - `game-type-rumble`
  - `game-type-stub`
- Game list item actions:
  - `open` — Open game view.
  - `join` — Join as player.
  - `observe` — Join as observer.
  - `leave` — Leave game.
  - `start` — Owner/admin start game.
  - `end` — Owner/admin end game.
  - `delete` — Owner/admin delete game.
- Game list state indicators:
  - `status-open` / `status-closed` / `status-in-progress` — game lifecycle.
  - `players` — small people/group icon with count.
  - `observers` — eye/observer icon with count.
  - `owner` — crown or star to mark owner.
  - `progress-phase` — phase/round indicator (small badge).

## Game Row / Controls (common)
- Action states for buttons: `button-primary`, `button-secondary`, `button-disabled` (visual states).
- Icon: `tooltip-indicator` — for hover title hints (optional).

## Mafia Screen (lobby & in-game)
- Panel actions:
  - `mafia-refresh` — Refresh mafia state.
  - `change-icon` — Open icon picker.
  - `ready` / `not-ready` — Ready button and state.
  - `withdraw-vote` — Withdraw vote action.
- Target row actions:
  - `suggest` — Suggest target (action button icon + pending state).
  - `vote` — Vote target (action button icon + selected state).
- Target row state indicators:
  - `is-suggested` — row highlight or badge when suggested by you.
  - `is-voted` — row highlight or badge when you voted.
  - `incoming-suggesters` — small avatar stack for players who suggested this target.
  - `incoming-voters` — small avatar stack for players who voted this target.
  - `alive` — green dot / life icon.
  - `eliminated` — skull / greyed-out avatar.
  - `known-mafia` / `known-town` — role badges for revealed roles.

## Player Icon / Picker UI
- Icon: `icon-preview` — player's current icon preview.
- Picker UI elements:
  - `tab` — icon group tab state (active/inactive).
  - `grid-option` — icon option tile (normal / selected / focused).
  - `selected-check` — overlay checkmark for selected icon.
  - `cancel` — cancel selection.

## History / Results
- Icon: `result` — small result/message marker.
- Icon: `winner` — trophy badge for winner summaries.

## Accessibility / States
- `focus-ring` visual treatment for keyboard focus on icon tiles and buttons.
- `aria-hidden` glyph variants where decorative only.

## Notes
- Provide two visual sizes where needed: small (16px) for inline badges and micro-counts, medium (20–24px) for buttons, and large (40–64px) for player avatar previews.
- Produce two visual variants for interactive icons: default and disabled/ghost.

---
Next step: generate creative prompts and examples for each icon (per-user request).
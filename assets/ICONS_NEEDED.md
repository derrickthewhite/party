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
- Action: `refresh` — Shared refresh action used for lobby, game lists, and in-game refresh buttons.
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
- Action: `send-message` — Shared send action used by the game chat composer.
- Action states for buttons: `button-primary`, `button-secondary`, `button-disabled` (visual states).
- Icon: `tooltip-indicator` — for hover title hints (optional).

## Mafia Screen (lobby & in-game)
- Panel actions:
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

## Rumble Round Report
- Icon: `rumble-report-energy` — round-start energy in the compact per-player last-round summary.
- Icon: `rumble-report-health` — start/end health in the compact per-player last-round summary.
- Icon: `rumble-report-attack` — energy spent on outgoing attacks.
- Icon: `rumble-report-abilities` — energy spent on ability activations.
- Icon: `rumble-report-defense` — reserved defense for the round.
- Icon: `rumble-report-incoming` — incoming attacks before mitigation.
- Icon: `rumble-report-damage` — damage that got through.
- Icon: `rumble-report-burn` — health burn or upkeep health loss.
- Icon: `rumble-report-heal` — healing gained during the round.
- Icon: `rumble-report-arrow` — separator arrow between summary stages.

## Accessibility / States
- `focus-ring` visual treatment for keyboard focus on icon tiles and buttons.
- `aria-hidden` glyph variants where decorative only.

## Notes
- Provide two visual sizes where needed: small (16px) for inline badges and micro-counts, medium (20–24px) for buttons, and large (40–64px) for player avatar previews.
- Produce two visual variants for interactive icons: default and disabled/ghost.

## Button Icon Style
- General direction: monochrome SVG, bold solid glyph, single fill, no strokes, optimized to read cleanly at 16px.
- Mood: medieval or storybook-adjacent without becoming ornate; strong silhouettes first, detail second.
- Composition: centered icon mass, simple geometric structure, minimal interior cutouts, avoid thin appendages that disappear at small sizes.
- Button usage: these icons are used in icon-only buttons, so the silhouette must carry the meaning without visible text.
- File baseline: 24x24 viewBox is preferred for new prompts, but existing traced assets in this repository also use larger viewBox values when needed.

## Stored Prompt Examples

### Open
Monochrome SVG, 24x24 viewBox, solid glyph of a old-style medival arched door with a left-pointing arrow overlay at center-right; simple geometric shapes, strong silhouette, optimized for 16px, single fill.

### Observe
Monochrome SVG, 24x24 viewBox, solid glyph of an eye, medieval feel; minimal pupil, strong silhouette, optimized for 16px, single fill.

### Leave
Monochrome SVG, 24x24 viewBox, solid glyph of a cloaked figure stepping through a medieval arched door with a large right-pointing arrow at the center left; simple readable shapes, optimized for 16px, single fill.

### Start
Monochrome SVG, 24x24 viewBox, solid glyph of a french hunting horn with the bell pointing right and the mouthpiece pointing left: bold centered silhouette, optimized for 16px, single fill.

## Prompt Drafts For Better Icons

### Create Game
Monochrome SVG, 24x24 viewBox, solid glyph of a medieval arched hall or fortress door with a small heraldic plus badge integrated into the upper-right corner; simple geometric shapes, bold silhouette, optimized for 16px, single fill.

### Send Message
Monochrome SVG, 24x24 viewBox, solid glyph of a rolled parchment message with a right-pointing dispatch arrow, medieval courier feel; minimal folds, strong silhouette, optimized for 16px, single fill.

### Change Icon
Monochrome SVG, 24x24 viewBox, solid glyph of a round portrait medallion with a simple face silhouette and a small swap arrow motif wrapping one side; medieval badge feel, bold centered silhouette, optimized for 16px, single fill.

### Suggest
Monochrome SVG, 24x24 viewBox, solid glyph of a subtle proposing gesture such as a hand or token offering toward a target marker, less forceful than a vote icon; simple readable shapes, strong silhouette, optimized for 16px, single fill.

### Vote
Monochrome SVG, 24x24 viewBox, solid glyph of a medieval ballot box or urn receiving a marked token, decisive and official; bold centered silhouette, optimized for 16px, single fill.

### Withdraw Vote
Monochrome SVG, 24x24 viewBox, solid glyph of a medieval ballot token being pulled back out of a ballot box or urn with a clear backward motion cue; simple readable shapes, strong silhouette, optimized for 16px, single fill.

## Game State Icon Set (Implemented)

The following simple filled-glyph SVGs are now implemented under `assets/GameStateIcons/`.

### Game Type Icons
- `TypeChat.svg`
- `TypeMafia.svg`
- `TypeDiplomacy.svg`
- `TypeRumble.svg`
- `TypeStub.svg`

### Game Status Icons
- `StatusOpen.svg`
- `StatusInProgress.svg`
- `StatusClosed.svg`

### Current Phase Icons
- `PhaseChatChat.svg`
- `PhaseMafiaStart.svg`
- `PhaseMafiaDay.svg`
- `PhaseMafiaNight.svg`
- `PhaseRumbleBidding.svg`
- `PhaseRumbleBattle.svg`
- `PhaseDiplomacyOrders.svg`

### Future Placeholder Phase Icons
- `PhaseMafiaTrial.svg`
- `PhaseMafiaDusk.svg`
- `PhaseRumbleResolve.svg`
- `PhaseDiplomacyRetreat.svg`
- `PhaseDiplomacyBuild.svg`
- `PhaseChatArchive.svg`
- `PhaseGenericSetup.svg`

## Prompt Ideas For Replacements

### Game Type: Chat
Monochrome SVG, 24x24 viewBox, filled glyph of a speech bubble with three centered dots, clean silhouette with no thin lines, readable at 16px.

### Game Type: Mafia
Monochrome SVG, 24x24 viewBox, filled glyph of a fedora and mask profile badge, bold silhouette that suggests hidden identity, readable at 16px.

### Game Type: Diplomacy
Monochrome SVG, 24x24 viewBox — filled glyph of a old  parchment treaty with a wax seal in bottom right overlaid with a dagger in the center at an artistic angle; compact, high-contrast silhouette, betrayal, optimized for 16px.

### Game Type: Rumble
Monochrome SVG, 24x24 viewBox, filled glyph of crossed swords and compact guard shapes, high-contrast silhouette, readable at 16px.

### Game Type: Stub
Monochrome SVG, 24x24 viewBox, filled glyph of a blueprint block with a notch or placeholder tile motif, simple geometric silhouette, readable at 16px.

### Status: Open
Monochrome SVG, 24x24 viewBox, filled glyph of an unlocked padlock with an open shackle tilt, strong silhouette and minimal details, readable at 16px.

### Status: In Progress
Monochrome SVG, 24x24 viewBox, filled glyph of an hourglass with bold top and bottom chambers, simple interior cutout, readable at 16px.

### Status: Closed
Monochrome SVG, 24x24 viewBox, filled glyph of a locked padlock with sturdy rectangular body and closed shackle, readable at 16px.

### Phase: Mafia Start
Monochrome SVG, 24x24 viewBox, filled glyph of a spotlight or reveal eye badge, compact centered silhouette signaling role reveal, readable at 16px.

### Phase: Mafia Day
Monochrome SVG, 24x24 viewBox, filled glyph of a bright sun medallion with thick rays, simple radial silhouette, readable at 16px.

### Phase: Mafia Night
Monochrome SVG, 24x24 viewBox, filled glyph of a crescent moon with one star cutout, bold silhouette, readable at 16px.

### Phase: Rumble Bidding
Monochrome SVG, 24x24 viewBox, filled glyph of stacked coins with a small upward marker, solid silhouette, readable at 16px.

### Phase: Rumble Battle
Monochrome SVG, 24x24 viewBox, filled glyph of crossed blades over a shield, concentrated center mass, readable at 16px.

### Phase: Diplomacy Orders
Monochrome SVG, 24x24 viewBox, filled glyph of a sealed scroll with directive lines, minimal folds, readable at 16px.

### Future Placeholder: Mafia Trial
Monochrome SVG, 24x24 viewBox, filled glyph of balance scales with broad pans and thick stem, bold and legible at 16px.

### Future Placeholder: Mafia Dusk
Monochrome SVG, 24x24 viewBox, filled glyph of a half-set sun crossing the horizon bar, clear silhouette, readable at 16px.

### Future Placeholder: Rumble Resolve
Monochrome SVG, 24x24 viewBox, filled glyph of a checkmark over burst badge, compact shape for resolution state, readable at 16px.

### Future Placeholder: Diplomacy Retreat
Monochrome SVG, 24x24 viewBox, filled glyph of a backward arrow over a shield outline block, strong silhouette, readable at 16px.

### Future Placeholder: Diplomacy Build
Monochrome SVG, 24x24 viewBox, filled glyph of a tower keep with integrated plus badge, blocky silhouette, readable at 16px.

### Future Placeholder: Chat Archive
Monochrome SVG, 24x24 viewBox, filled glyph of an archive box with lid and label notch, simple geometric form, readable at 16px.

### Future Placeholder: Generic Setup
Monochrome SVG, 24x24 viewBox, filled glyph of a gear with a center dot, wide teeth and minimal cutouts, readable at 16px.

### Rumble Report: Energy
Monochrome SVG, 24x24 viewBox, filled glyph of a compact lightning bolt nested in a rounded meter badge, bold silhouette, readable at 14px.

### Rumble Report: Health
Monochrome SVG, 24x24 viewBox, filled glyph of a sturdy heart medallion with minimal interior cut, bold and compact, readable at 14px.

### Rumble Report: Attack Spend
Monochrome SVG, 24x24 viewBox, filled glyph of a forward-thrusting sword with a short motion wedge, compact horizontal silhouette, readable at 14px.

### Rumble Report: Ability Spend
Monochrome SVG, 24x24 viewBox, filled glyph of a radiant star core inside a round badge, suggesting systems activation without thin points, readable at 14px.

### Rumble Report: Defense
Monochrome SVG, 24x24 viewBox, filled glyph of a broad shield block with a simple center notch, strong silhouette, readable at 14px.

### Rumble Report: Incoming
Monochrome SVG, 24x24 viewBox, filled glyph of three descending bolts converging on a central point, compact and high contrast, readable at 14px.

### Rumble Report: Damage Through
Monochrome SVG, 24x24 viewBox, filled glyph of a cracked shield with a sharp impact wedge, compact silhouette, readable at 14px.

### Rumble Report: Burn
Monochrome SVG, 24x24 viewBox, filled glyph of a simple flame drop with a small inner cut, bold silhouette, readable at 14px.

### Rumble Report: Heal
Monochrome SVG, 24x24 viewBox, filled glyph of a compact medical cross nested in a round medallion or repair badge, bold silhouette, readable at 14px.

### Rumble Report: Arrow
Monochrome SVG, 24x24 viewBox, filled glyph of a short broad directional arrow pointing right, simple centered silhouette, readable at 14px.

---
Current implementation includes initial SVGs for `create-game`, `send-message`, `change-icon`, `suggest`, `vote`, and `withdraw-vote` under `assets/ButtonIcons/`.

The compact Rumble round-report icon set is implemented under `assets/GameStateIcons/` as `RumbleReportEnergy.svg`, `RumbleReportHealth.svg`, `RumbleReportAttack.svg`, `RumbleReportAbilities.svg`, `RumbleReportDefense.svg`, `RumbleReportIncoming.svg`, `RumbleReportDamage.svg`, `RumbleReportBurn.svg`, `RumbleReportHeal.svg`, and `RumbleReportArrow.svg`.
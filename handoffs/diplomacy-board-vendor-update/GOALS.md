# Goals (host product)

The host mounts this board. PHP remains the rules engine. These are board/map behaviors the host needs.

## 1. Owned-province outlines must be visible

Territory fill and the ownership outline were the same color, so borders disappeared.

- Outline stroke is **not** `power.color`.
- Auto contrast: about **20% darker** on light fills, **20% lighter** on dark fills (`contrastStroke`).
- Stroke is per path so two controlled nations can both be outlined.
- When `orderScope === "mine"`, outline **every** power in `playingAsPowers`, not only one `playingAs`.

## 2. Orders bar follows the unit

`.move-popup` was centered in the viewport and ignored unit clicks.

- Anchor the popup to the selected unit’s map point (`unitPoint` / province center).
- Offset so it does not cover the token; clamp to the viewport.
- Reposition on pan/zoom (camera already calls `placePopup`).

## 3. Token / map assets must not stick in cache (board side)

The host already sends `Cache-Control: no-store` and a page-load `?v=` stamp. On the board:

- `fetch(mapUrl, { cache: "no-store" })` for the map SVG.
- Accept stamped URLs as-is.

`army.svg` / `fleet.svg` are still unused; tokens are canvas-drawn. Do not assume cache-busting those SVGs changes token art.

## 4. Order for every controlled nation at once

The host dropped the “Ordering for” dropdown. A player with two nations must click either nation’s units without switching.

- Mount option `playingAsPowers: string[]`.
- `setPlayingAsPowers(ids)`; `setPlayingAs(id)` stays as a one-id wrapper.
- Units, retreats, and adjustments are clickable if `power` is in that set.
- `exportOrders(powerId)` still emits **one** power. Host submits each controlled power.
- `importDocument` for one power must not wipe the other powers’ orders (replace that power only).
- `unitNeedsOrder` rings every controlled power that still needs an order.

## 5. Token positions live in JSON and are editable

Fleet (and army) locations must be customizable, not only graph centers/coast anchors.

- Per map: `{MapKey}.tokens.json` (`kind: "diplomacy-token-positions"`).
- Keys: province id for army / sea fleet; `provinceId:coastId` for named coastal fleets. Unnamed coastal fleet may share the province key as `{ army, fleet }`.
- Generate defaults from current `unitPoint` / `fleetFacing` math (`generate-token-positions.js`).
- Runtime: `graph.tokenSlots`; `unitPoint` / facing prefer overrides.
- Edit mode: `setTokenEdit`, drag all slots (not only live units), **Download JSON** (no server write), `onTokenEdit` callback.

The host loads `tokens_url` and will call `setTokenEdit` / `downloadTokenPositions`. Implement those APIs on the board.

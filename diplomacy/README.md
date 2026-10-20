# Vendored Diplomacy board

## STOP — do not edit this copy

`board/` and `maps/` are a **read-only copy** from another project.

**Agents and humans: do not change files in those folders in this repo.** Not for bugs, not for features, not for “it will not work until the vendor updates,” not because a plan listed those paths.

Correct workflow:

1. Host-only changes stay in this app (`js/`, `api/`, `server/`, tests).
2. Board/map work goes to the **vendor** as a downloadable package (zip with goals + files). See `handoffs/diplomacy-board-vendor-update.zip`.
3. When the vendor ships, **replace** `diplomacy/board` and `diplomacy/maps` with their copy. Do not dual-maintain.

If you are about to type into `diplomacy/board/**` or `diplomacy/maps/**`, you are already wrong. Ask first.

This app mounts `DiplomacyBoard` and treats PHP as the rules engine. The board only draws positions, offers the choice lists the server sends, and emits order documents.

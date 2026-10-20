# Diplomacy board vendor update

Upload this whole zip to the vendor board AI. Apply the changes in **your** board/maps repo, then ship a copy back. Do not treat the host app as the place to maintain this code.

## What to do

1. Read `GOALS.md` (product intent).
2. Apply the files under `files/` onto your tree (same relative paths under `board/` and `maps/`).
3. If a merge is cleaner, use `patches/board.diff` against your current `board/` JS/CSS.
4. Run `node maps/generate-token-positions.js` from your maps folder if token JSON is stale after graph edits.
5. Return an updated `board/` + `maps/` drop the host can **replace wholesale**.

`files/` contains the intended end state of the edited sources (plus generated default `*.tokens.json`). Prefer those over reconstructing from the goals alone.

## Files in this zip

| Path | Role |
|---|---|
| `GOALS.md` | Why these changes exist |
| `files/board/js/board.js` | Token slots; `unitPoint` / facing overrides |
| `files/board/js/draw.js` | Contrast ownership strokes; multi-power outlines; token-edit paint |
| `files/board/js/mount.js` | Popup beside unit; `playingAsPowers`; token drag editor |
| `files/board/js/camera.js` | Ignore `.token-edit-bar` on pan |
| `files/board/css/board.css` | Token edit bar |
| `files/maps/generate-token-positions.js` | Build default `{Map}.tokens.json` |
| `files/maps/*/*.tokens.json` | Defaults from current graph centers/anchors |
| `patches/board.diff` | Git diff vs the previous vendored board copy |

Do not change adjudication rules or order legality unless a goal below requires it (none do).

# SVG sheet export notes

These notes are for splitting `assets/alienHeads.svg` into standalone icon SVGs that visually match the existing 64x64 files in `assets/PlayerIcons/`.

They should also be used for other source SVG files in `assets/` when the construction is similar, especially when the source file:

- was saved from Inkscape,
- contains one icon/character/object per top-level `<g>` under a layer such as `#layer1`,
- uses large global coordinates and nested transforms,
- needs to be turned into standalone `64x64` icon files.

`alienHeads.svg` is the current example source, but the workflow below is intended as the default export process for similar grouped SVG sheets kept in this same folder.

`aliensByRegion.svg` used the same export mechanics, but added one more filtering step first: not every top-level group was a head, and some groups were duplicates or partial fragments.

`CrimsonNetwork.svg` needed one further variation: the safest export path was to preserve each chosen group's original internal coordinates and crop it with a square standalone `viewBox`, instead of trying to rebuild the icon with fresh translate/scale wrappers.

## Output location

- Final exports live in `assets/PlayerIcons/AlienHeads/`.
- Keep each exported file as a standalone `64x64` SVG icon.

## What failed

- Copying raw top-level `<g>` groups into new files was not enough.
- Keeping Inkscape and Sodipodi attributes in the exported files made the SVGs invalid unless those namespaces were also declared.
- Reusing the source sheet's global transforms produced files that loaded but painted the artwork off-canvas, so the icons looked blank.

These same failures are likely for any similarly constructed SVG sheet in `assets/`.

## What worked

Use a browser-based export flow that measures the rendered group and normalizes it into a fresh local `0 0 64 64` SVG.

Working approach:

1. Open the source SVG from `assets/` in a browser context.
2. Select the top-level groups under the main layer, typically `#layer1`; each one should represent one exportable object.
3. Clone one group into a brand new standalone `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`.
4. Strip editor-only attributes from the clone and its descendants:
   - `id`
   - `inkscape:*`
   - `sodipodi:*`
   - extra `xmlns*`
5. Wrap the clone in fresh translate/scale groups inside the new SVG.
6. In the browser, iteratively measure the rendered bounding box with `getBoundingClientRect()` and adjust scale/translation until the artwork fits inside about `56x56` pixels centered in the `64x64` icon.
7. Serialize the new SVG and save it.

For `alienHeads.svg`, each top-level group under `#layer1` was one head and this process worked cleanly.

For `aliensByRegion.svg`, the reliable workflow was:

1. Measure top-level `#layer1 > g` candidates in a browser.
2. Render a visual contact sheet of those groups.
3. Exclude obvious non-head fragments, especially repeated helmet arcs and empty groups.
4. Check for valid head groups that sit partially or fully outside the root SVG page bounds; do not assume the visible page contains the full asset set.
5. Keep only the complete standalone heads.
6. Export those selected groups with the same fresh-`64x64` wrapper workflow.

The exported `aliensByRegion` icons were written to `assets/PlayerIcons/AliensByRegionHeads/`, and the exact source-group-to-file mapping was saved in `assets/PlayerIcons/AliensByRegionHeads/manifest.json`.

For `CrimsonNetwork.svg`, the reliable workflow was:

1. Render a preview of the pre-split top-level groups and child groups.
2. Select the actual face-bearing top-level groups; many child exports were only eyes, mouths, props, or accessories.
3. Clone the chosen top-level group into a new standalone SVG.
4. Measure the clone's rendered bounds in the browser.
5. Keep the group's original coordinates intact and set the new root SVG's `viewBox` to a padded square crop centered on those bounds.
6. Validate by loading the result through a data URL in a headless browser and counting non-transparent pixels.

The exported `CrimsonNetwork` icons were written to `assets/PlayerIcons/CrimsonNetworkHeads/`, with per-batch manifests and a combined `manifest.all.json`.

## Validation

Do not stop at "the file loads". Validate that each icon actually paints visible pixels.

Reliable check:

1. Load the generated SVG into an `<img>` in a headless browser.
2. Draw it to a `64x64` canvas.
3. Count pixels where alpha is greater than zero.
4. If the count is zero, the artwork is still off-canvas even if the SVG is otherwise valid.

## Practical guidance for the next export

- Prefer a browser script using Playwright because it can measure the real rendered bounds.
- Do not trust source-sheet coordinates or copied transforms by themselves.
- Do not assume one normalization method works for every sheet.
- For `alienHeads.svg` and `aliensByRegion.svg`, fresh wrapper translate/scale groups were reliable.
- For `CrimsonNetwork.svg`, wrapper transforms repeatedly produced blank standalone files; cropping with a padded square `viewBox` around the preserved source coordinates was the reliable fix.
- Keep some padding so the heads align with the other player icons instead of touching the edges.
- If a future SVG in `assets/` has the same grouped-sheet structure, start with this workflow before trying manual SVG surgery.
- If a sheet mixes real heads with fragments or duplicates, build a rendered candidate sheet first and decide the export list from the rendered output, not from raw group ids alone.
- If the source was laid out beyond the visible page, inspect off-page top-level groups separately; in `aliensByRegion.svg`, that is where a substantial second batch of valid heads lived.
- Do not rely on a minimum bounding-box cutoff to decide whether a group is worth reviewing; `aliensByRegion.svg` had additional valid right-edge human heads whose raw bounds were much smaller than the earlier creature groups.
- If targeted passes still leave visible omissions, export every remaining unselected top-level group into a normalized review sheet; for `aliensByRegion.svg`, that full remainder pass exposed the tongue-out aliens and extra blue/green bug variants that were missed by earlier edge-focused scans.
- If you render previews mid-run, do not reuse the same browser page for later source extraction without reloading the source SVG; this caused a false "missing id" failure during the CrimsonNetwork batch export.

## App integration reminder

- The asset export is separate from app support.
- `js/playerIcons.js` currently assumes flat filenames under `assets/PlayerIcons/`, so nested keys like `AlienHeads/AlienHead01.svg` need loader changes before the app can use them directly.
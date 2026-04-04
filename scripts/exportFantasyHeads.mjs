import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');
const sourcePath = path.join(workspaceRoot, 'assets', 'fantasyHeads.svg');
const outputDir = path.join(workspaceRoot, 'assets', 'PlayerIcons', 'FantasyHeads');
const reviewDir = path.join(outputDir, '_review');

const reviewHtmlPath = path.join(reviewDir, 'contact-sheet.html');
const reviewPngPath = path.join(reviewDir, 'contact-sheet.png');
const candidatesJsonPath = path.join(reviewDir, 'candidates.json');
const manifestPath = path.join(outputDir, 'manifest.json');

const EXCLUDED_IDS = new Set([]);
const EXPORTS = new Map([
  ['g9303-7-0', { name: 'Spotted Boar', file: 'Spotted Boar.svg' }],
  ['g3982', { name: 'Brown Dog', file: 'Brown Dog.svg' }],
  ['g5022-63', { name: 'Black Hound', file: 'Black Hound.svg' }],
  ['g7490-4', { name: 'Needle Mask', file: 'Needle Mask.svg' }],
  ['g17526-6', { name: 'Red Crest Soldier', file: 'Red Crest Soldier.svg' }],
  ['g18034-3', { name: 'Black Horse', file: 'Black Horse.svg' }],
  ['g18103-8', { name: 'Brown Horse', file: 'Brown Horse.svg' }],
  ['g17077-6-6', { name: 'White Horse', file: 'White Horse.svg' }],
  ['g8602', { name: 'Striped Serpent', file: 'Striped Serpent.svg' }],
  ['g1', { name: 'Bandana Skull', file: 'Bandana Skull.svg' }],
  ['g11472-6-5', { name: 'Beaked Skull Mask', file: 'Beaked Skull Mask.svg' }],
  ['g11750-3-0', { name: 'Pointed Hood Skull', file: 'Pointed Hood Skull.svg' }],
  ['g9670-6-4', { name: 'Floppy Hood Skull', file: 'Floppy Hood Skull.svg' }],
  ['g9451-9-9', { name: 'Wide Hat Skull', file: 'Wide Hat Skull.svg' }],
  ['g9356-2-0', { name: 'Red Hood Skull', file: 'Red Hood Skull.svg' }],
  ['g9485-0-6', { name: 'Black Cap Skull', file: 'Black Cap Skull.svg' }],
  ['g10185-5', { name: 'Red Crest Skull', file: 'Red Crest Skull.svg' }],
  ['g10082-1', { name: 'Red Hat Skull', file: 'Red Hat Skull.svg' }],
  ['g10277-9', { name: 'Blonde Hood Skull', file: 'Blonde Hood Skull.svg' }],
  ['g12574-6', { name: 'Panda', file: 'Panda.svg' }],
  ['g12067-1', { name: 'Red Panda', file: 'Red Panda.svg' }],
  ['g18061-6-2', { name: 'Wolf', file: 'Wolf.svg' }],
  ['g18178-1-2', { name: 'Goblin', file: 'Goblin.svg' }],
  ['g22919', { name: 'Red Bandana Skull', file: 'Red Bandana Skull.svg' }],
  ['g22975', { name: 'Blue Tassel Skull', file: 'Blue Tassel Skull.svg' }],
  ['g23027', { name: 'Long Bandana Skull', file: 'Long Bandana Skull.svg' }],
  ['g2', { name: 'Black Tricorne Skull', file: 'Black Tricorne Skull.svg' }],
  ['g19576-92-0-1-8-5', { name: 'Brown Mare', file: 'Brown Mare.svg' }],
  ['g29450-7-8-5-4', { name: 'Grey Speckled Horse', file: 'Grey Speckled Horse.svg' }],
  ['g28751-7-6-9-0', { name: 'Tan Horse', file: 'Tan Horse.svg' }],
  ['g62048-6-6-4-3', { name: 'Tall Shako Soldier', file: 'Tall Shako Soldier.svg' }],
  ['g7', { name: 'Crown Cap Soldier', file: 'Crown Cap Soldier.svg' }],
  ['g3', { name: 'Red Tricorne Soldier', file: 'Red Tricorne Soldier.svg' }],
  ['g102275-90-9', { name: 'Brown Lizard', file: 'Brown Lizard.svg' }],
  ['g164943-0-0-8', { name: 'Blue Jay', file: 'Blue Jay.svg' }],
  ['g52636', { name: 'Green Reptile', file: 'Green Reptile.svg' }],
  ['g5415-2-1-3', { name: 'Orange Beast', file: 'Orange Beast.svg' }],
  ['g77284', { name: 'Unicorn', file: 'Unicorn.svg' }],
  ['g77271', { name: 'Green Hood Archer', file: 'Green Hood Archer.svg' }],
  ['g7160-2', { name: 'Plain Skull', file: 'Plain Skull.svg' }],
  ['g4943-4', { name: 'Black Headwrap Man', file: 'Black Headwrap Man.svg' }],
  ['g12529', { name: 'Black Cap Man', file: 'Black Cap Man.svg' }],
  ['g8', { name: 'Dragon', file: 'Dragon.svg' }],
]);

function safeLabel(raw) {
  return raw.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'Group';
}

function exportFileName(candidate) {
  const exportInfo = EXPORTS.get(candidate.id);
  if (exportInfo && exportInfo.file) {
    return exportInfo.file;
  }

  return `FantasyHead${String(candidate.index).padStart(2, '0')}_${safeLabel(candidate.id)}.svg`;
}

function reviewFileName(candidate) {
  return `candidate-${String(candidate.index).padStart(2, '0')}-${safeLabel(candidate.id)}.svg`;
}

function renderReviewHtml(candidates) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FantasyHeads review</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: "Segoe UI", sans-serif;
      background: #f4f1e8;
      color: #201c17;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(280px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .card {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid #c7baa4;
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 8px 24px rgba(44, 36, 24, 0.08);
    }
    .preview {
      width: 128px;
      height: 128px;
      display: block;
      margin: 0 auto 10px;
      image-rendering: auto;
      background: linear-gradient(180deg, #fefefe, #ece2cf);
      border-radius: 12px;
    }
    .title {
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 4px;
      word-break: break-word;
    }
    .meta {
      font-size: 12px;
      line-height: 1.45;
      color: #5a4d3f;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="grid">
    ${candidates.map((candidate) => `
      <section class="card">
        <img class="preview" alt="${candidate.id}" src="./${candidate.reviewFile}">
        <div class="title">${candidate.index}. ${candidate.id}</div>
        <div class="meta">painted: ${candidate.paintedPixels}</div>
        <div class="meta">bbox: ${candidate.width.toFixed(2)} x ${candidate.height.toFixed(2)}</div>
        <div class="meta">origin: ${candidate.x.toFixed(2)}, ${candidate.y.toFixed(2)}</div>
        <div class="meta">excluded: ${candidate.excluded ? 'yes' : 'no'}</div>
      </section>
    `).join('')}
  </div>
</body>
</html>
`;
}

const browser = await chromium.launch();
const sourcePage = await browser.newPage({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: 2 });
const validationPage = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });

await fs.mkdir(reviewDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const existingEntries = await fs.readdir(outputDir, { withFileTypes: true });
for (const entry of existingEntries) {
  if (!entry.isFile() || !/\.svg$/i.test(entry.name)) {
    continue;
  }

  await fs.unlink(path.join(outputDir, entry.name));
}

console.log(`Loading source SVG from ${sourcePath}`);
await sourcePage.goto(pathToFileURL(sourcePath).href);

const rawCandidates = await sourcePage.evaluate(() => {
  function sanitizeClone(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    for (const attribute of [...node.attributes]) {
      if (
        attribute.name === 'id' ||
        attribute.name.startsWith('inkscape:') ||
        attribute.name.startsWith('sodipodi:') ||
        attribute.name.startsWith('xmlns')
      ) {
        node.removeAttribute(attribute.name);
      }
    }

    for (const child of [...node.children]) {
      sanitizeClone(child);
    }
  }

  function makeStandalone(group, bounds, paddingPx = 4) {
    const sourceSvg = document.documentElement;
    const clone = group.cloneNode(true);
    sanitizeClone(clone);

    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    const padding = Math.max(width, height) * (paddingPx / 56);
    const squareSize = Math.max(width, height) + padding * 2;
    const centerX = bounds.x + width / 2;
    const centerY = bounds.y + height / 2;
    const viewBoxX = centerX - squareSize / 2;
    const viewBoxY = centerY - squareSize / 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '64');
    svg.setAttribute('height', '64');
    svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${squareSize} ${squareSize}`);

    const defs = sourceSvg.querySelector('defs');
    if (defs) {
      const defsClone = defs.cloneNode(true);
      sanitizeClone(defsClone);
      svg.appendChild(defsClone);
    }

    svg.appendChild(clone);
    return new XMLSerializer().serializeToString(svg);
  }

  function getTransformedBounds(group) {
    const svg = document.documentElement;
    const rect = group.getBoundingClientRect();
    const rootMatrix = svg.getScreenCTM();

    if (!rect || !rootMatrix) {
      return null;
    }

    const inverseRootMatrix = rootMatrix.inverse();

    const points = [
      new DOMPoint(rect.left, rect.top),
      new DOMPoint(rect.right, rect.top),
      new DOMPoint(rect.left, rect.bottom),
      new DOMPoint(rect.right, rect.bottom),
    ].map((point) => point.matrixTransform(inverseRootMatrix));

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return [...document.querySelectorAll('#layer1 > g')]
    .map((group, index) => {
      const bounds = getTransformedBounds(group);
      if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
        return null;
      }

      return {
        index: index + 1,
        id: group.id || `group_${index + 1}`,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        svgMarkup: makeStandalone(group, bounds),
      };
    })
    .filter(Boolean);
});

console.log(`Found ${rawCandidates.length} top-level groups under #layer1`);

async function countPaintedPixels(svgMarkup) {
  return validationPage.evaluate(async (markup) => {
    const image = new Image();
    const payload = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = payload;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, 64, 64);
    context.drawImage(image, 0, 0, 64, 64);

    const { data } = context.getImageData(0, 0, 64, 64);
    let painted = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) {
        painted += 1;
      }
    }
    return painted;
  }, svgMarkup);
}

const candidates = [];
for (const candidate of rawCandidates) {
  const reviewFile = reviewFileName(candidate);
  await fs.writeFile(path.join(reviewDir, reviewFile), `${candidate.svgMarkup}\n`, 'utf8');
  const paintedPixels = await countPaintedPixels(candidate.svgMarkup);
  candidates.push({
    ...candidate,
    paintedPixels,
    reviewFile,
    excluded: EXCLUDED_IDS.has(candidate.id),
  });
}

const candidateSummary = candidates.map(({ svgMarkup, ...candidate }) => candidate);
await fs.writeFile(candidatesJsonPath, `${JSON.stringify(candidateSummary, null, 2)}\n`, 'utf8');

const reviewHtml = renderReviewHtml(candidates);
await fs.writeFile(reviewHtmlPath, reviewHtml, 'utf8');
await sourcePage.goto(pathToFileURL(reviewHtmlPath).href);
await sourcePage.screenshot({ path: reviewPngPath, fullPage: true });

const selected = candidates.filter((candidate) => candidate.paintedPixels > 0 && !EXCLUDED_IDS.has(candidate.id));
const manifest = [];

for (const candidate of selected) {
  const fileName = exportFileName(candidate);
  const exportInfo = EXPORTS.get(candidate.id);
  await fs.writeFile(path.join(outputDir, fileName), `${candidate.svgMarkup}\n`, 'utf8');
  manifest.push({
    index: candidate.index,
    id: candidate.id,
    name: exportInfo?.name ?? fileName.replace(/\.svg$/i, ''),
    file: fileName,
    paintedPixels: candidate.paintedPixels,
    width: candidate.width,
    height: candidate.height,
  });
}

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

await browser.close();

console.log(`Review sheet written to ${reviewPngPath}`);
console.log(`Candidate data written to ${candidatesJsonPath}`);
console.log(`Exported ${selected.length} icons to ${outputDir}`);
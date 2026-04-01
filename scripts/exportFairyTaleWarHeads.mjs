import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');
const sourcePath = path.join(workspaceRoot, 'assets', 'FairyTaleWar.svg');
const outputDir = path.join(workspaceRoot, 'assets', 'PlayerIcons', 'FairyTaleWarHeads');
const reviewDir = path.join(outputDir, '_review');

const reviewHtmlPath = path.join(reviewDir, 'contact-sheet.html');
const reviewPngPath = path.join(reviewDir, 'contact-sheet.png');
const candidatesJsonPath = path.join(reviewDir, 'candidates.json');
const manifestPath = path.join(outputDir, 'manifest.json');

const FACE_IDS = [
  'g4943-4-6',
  'g116677',
  'g77318',
  'g77301',
  'g77301-0',
  'g77249',
  'g77271',
  'g120616',
  'g134078',
  'g134063',
  'g134093',
  'g134529',
  'g126440',
  'g117503',
  'g117691',
  'g118679',
  'g118675',
  'g118928',
  'g119803',
  'g125432',
  'g131726',
  'g134545',
  'g133427',
  'g133632',
  'g7125',
];

const FACE_EXPORTS = new Map([
  ['g4943-4-6', { name: 'HeadbandWarrior', file: 'HeadbandWarrior.svg' }],
  ['g116677', { name: 'CrownedKing', file: 'CrownedKing.svg' }],
  ['g77318', { name: 'GreatHelm', file: 'GreatHelm.svg' }],
  ['g77301-0', { name: 'SunPriestess', file: 'SunPriestess.svg' }],
  ['g77249', { name: 'WhiteHairedNoble', file: 'WhiteHairedNoble.svg' }],
  ['g120616', { name: 'HeadbandPage', file: 'HeadbandPage.svg' }],
  ['g134078', { name: 'YoungKing', file: 'YoungKing.svg' }],
  ['g134063', { name: 'MustachedKing', file: 'MustachedKing.svg' }],
  ['g134093', { name: 'SternKing', file: 'SternKing.svg' }],
  ['g134529', { name: 'BeardedKing', file: 'BeardedKing.svg' }],
  ['g126440', { name: 'StripedCapPage', file: 'StripedCapPage.svg' }],
  ['g117503', { name: 'GreenDragon', file: 'GreenDragon.svg' }],
  ['g117691', { name: 'BarredHelm', file: 'BarredHelm.svg' }],
  ['g118679', { name: 'TVisorHelm', file: 'TVisorHelm.svg' }],
  ['g118675', { name: 'TuskOgre', file: 'TuskOgre.svg' }],
  ['g118928', { name: 'GreyHoodWoman', file: 'GreyHoodWoman.svg' }],
  ['g119803', { name: 'Witch', file: 'Witch.svg' }],
  ['g125432', { name: 'BoarHead', file: 'BoarHead.svg' }],
  ['g131726', { name: 'NasalHelm', file: 'NasalHelm.svg' }],
  ['g133427', { name: 'ClosedKnightHelm', file: 'ClosedKnightHelm.svg' }],
  ['g133632', { name: 'MailCapWarrior', file: 'MailCapWarrior.svg' }],
  ['g7125', { name: 'BlackCat', file: 'BlackCat.svg' }],
]);

function safeLabel(raw) {
  return raw.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'Group';
}

function reviewFileName(candidate) {
  return `candidate-${String(candidate.index).padStart(2, '0')}-${safeLabel(candidate.id)}.svg`;
}

function renderReviewHtml(candidates) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FairyTaleWar face review</title>
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
  candidates.push({ ...candidate, paintedPixels, reviewFile });
}

const candidateSummary = candidates.map(({ svgMarkup, ...candidate }) => candidate);
await fs.writeFile(candidatesJsonPath, `${JSON.stringify(candidateSummary, null, 2)}\n`, 'utf8');

const reviewHtml = renderReviewHtml(candidates);
await fs.writeFile(reviewHtmlPath, reviewHtml, 'utf8');
await sourcePage.goto(pathToFileURL(reviewHtmlPath).href);
await sourcePage.screenshot({ path: reviewPngPath, fullPage: true });

if (FACE_IDS.length > 0) {
  const selected = candidates.filter((candidate) => FACE_IDS.includes(candidate.id));
  const manifest = [];

  for (const [index, candidate] of selected.entries()) {
    const exportInfo = FACE_EXPORTS.get(candidate.id);
    const fileName = exportInfo?.file ?? `FairyHead${String(index + 1).padStart(2, '0')}_${safeLabel(candidate.id)}.svg`;
    const displayName = exportInfo?.name ?? fileName.replace(/\.svg$/i, '');
    await fs.writeFile(path.join(outputDir, fileName), `${candidate.svgMarkup}\n`, 'utf8');
    manifest.push({ id: candidate.id, name: displayName, file: fileName, paintedPixels: candidate.paintedPixels });
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

await browser.close();

console.log(`Review sheet written to ${reviewPngPath}`);
console.log(`Candidate data written to ${candidatesJsonPath}`);
if (FACE_IDS.length > 0) {
  console.log(`Exported ${FACE_IDS.length} icons to ${outputDir}`);
}
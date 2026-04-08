const fs = require('fs');
const path = require('path');
const potrace = require('potrace');
const { optimize } = require('svgo');

const iconsDir = path.join(__dirname, '..', 'assets', 'ButtonIcons');

function traceFile(filePath) {
  return new Promise((resolve, reject) => {
    potrace.trace(filePath, { threshold: 128 }, function(err, svg) {
      if (err) return reject(err);
      // Optimize with svgo
      const res = optimize(svg, { path: filePath });
      resolve(res.data);
    });
  });
}

async function main() {
  if (!fs.existsSync(iconsDir)) {
    console.error('Icons directory not found:', iconsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(iconsDir).filter(f => f.toLowerCase().endsWith('.png'));
  if (files.length === 0) {
    console.log('No PNG files found in', iconsDir);
    return;
  }

  for (const file of files) {
    const inPath = path.join(iconsDir, file);
    const outPath = path.join(iconsDir, path.basename(file, path.extname(file)) + '.svg');
    try {
      console.log('Tracing', file);
      const svg = await traceFile(inPath);
      fs.writeFileSync(outPath, svg, 'utf8');
      console.log('Wrote', outPath);
    } catch (err) {
      console.error('Failed to trace', file, err);
    }
  }
}

main();

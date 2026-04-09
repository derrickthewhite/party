const fs = require('fs');
const path = require('path');
const potrace = require('potrace');
const { optimize } = require('svgo');

const iconsDir = path.join(__dirname, '..', 'assets', 'ButtonIcons');

function getPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  // PNG stores width/height in the IHDR chunk at bytes 16-23
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Not a valid PNG or missing IHDR');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function traceFile(filePath) {
  return new Promise((resolve, reject) => {
    potrace.trace(filePath, { threshold: 128 }, function(err, svg) {
      if (err) return reject(err);
      const res = optimize(svg, { path: filePath });
      resolve(res.data);
    });
  });
}

async function main() {
  const nameArg = process.argv[2];
  if (!nameArg) {
    console.error('Usage: node scripts/trace-icon-single.js <png-filename>');
    process.exit(1);
  }

  const inPath = path.isAbsolute(nameArg) ? nameArg : path.join(iconsDir, nameArg);
  if (!fs.existsSync(inPath)) {
    console.error('File not found:', inPath);
    process.exit(1);
  }

  const outPath = path.join(path.dirname(inPath), path.basename(inPath, path.extname(inPath)) + '.svg');

  try {
    console.log('Reading size of', inPath);
    const { width, height } = getPngSize(inPath);

    console.log('Tracing', inPath);
    let svg = await traceFile(inPath);

    // Canonicalize the <svg> opening tag so there is exactly one
    // `viewBox`, `width`, and `height` attribute matching the PNG size.
    const openMatch = svg.match(/<svg([\s\S]*?)>/i);
    if (openMatch) {
      const attrsStr = openMatch[1];
      const attrRegex = /([^\s=]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/g;
      const attrs = {};
      let m;
      while ((m = attrRegex.exec(attrsStr)) !== null) {
        const k = m[1];
        let v = m[2];
        v = v.replace(/^['"]|['"]$/g, '');
        attrs[k] = v;
      }

      attrs.viewBox = attrs.viewBox || `0 0 ${width} ${height}`;
      attrs.width = `${width}`;
      attrs.height = `${height}`;

      // Build a deterministic attribute string: keep xmlns first when present.
      let outAttrs = '';
      if (attrs.xmlns) {
        outAttrs += ` xmlns="${attrs.xmlns}"`;
        delete attrs.xmlns;
      }
      for (const k of Object.keys(attrs)) {
        outAttrs += ` ${k}="${attrs[k]}"`;
      }

      svg = svg.replace(/<svg([\s\S]*?)>/i, `<svg${outAttrs}>`);
    } else {
      // Fallback: prepend a clean svg wrapper
      svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` + svg;
    }

    fs.writeFileSync(outPath, svg, 'utf8');
    console.log('Wrote', outPath);
  } catch (err) {
    console.error('Failed to trace', err);
    process.exit(1);
  }
}

main();

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');

const publicHost = process.env.PARTY_HOST || '127.0.0.1';
const publicPort = Number(process.env.PARTY_HOST_PORT || 8080);
const phpHost = process.env.PARTY_PHP_HOST || '127.0.0.1';
const phpPort = Number(process.env.PARTY_PHP_PORT || 8081);
const dbDriver = (process.env.PARTY_DB_DRIVER || 'sqlite').toLowerCase() === 'mysql' ? 'mysql' : 'sqlite';
const sqlitePath = process.env.PARTY_DB_SQLITE_PATH || path.join(dataDir, 'party.sqlite');
// Test harnesses can override the session path so E2E runs do not reuse normal local session files.
const sessionDir = process.env.PARTY_SESSION_SAVE_PATH || path.join(dataDir, 'sessions');
const phpBin = process.env.PARTY_PHP_BIN || (fs.existsSync(bundledPhp) ? bundledPhp : 'php');

const phpEnv = {
  ...process.env,
  PARTY_DB_DRIVER: dbDriver,
  PARTY_DB_SQLITE_PATH: sqlitePath,
  PARTY_SESSION_SAVE_PATH: sessionDir,
  PARTY_AUTH_ENFORCE_HTTPS: process.env.PARTY_AUTH_ENFORCE_HTTPS || '0',
  PARTY_ALLOW_ORIGIN: `http://${publicHost}:${publicPort}`,
};

const hiddenRoots = new Set(['api', 'server', 'data', 'runtime', '.git']);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function failStartup(message) {
  console.error(message);
  process.exit(1);
}

function hasBundledPhp() {
  return fs.existsSync(bundledPhp);
}

function explainPhpRuntime() {
  if (hasBundledPhp()) {
    return `Using bundled PHP runtime at ${bundledPhp}.`;
  }

  if (process.env.PARTY_PHP_BIN) {
    return `Using PARTY_PHP_BIN=${process.env.PARTY_PHP_BIN}.`;
  }

  return 'No bundled PHP runtime found. Falling back to php on PATH.';
}

function resolvePublicPath(requestPath) {
  const normalized = path.normalize(requestPath).replace(/^([/\\])+/, '');
  const rootName = normalized.split(path.sep)[0];
  if (hiddenRoots.has(rootName) || normalized.startsWith('.')) {
    return null;
  }

  const fullPath = path.join(rootDir, normalized);
  if (!fullPath.startsWith(rootDir)) {
    return null;
  }
  return fullPath;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function serveFile(res, filePath) {
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function proxyToPhp(req, res) {
  const proxyReq = http.request(
    {
      hostname: phpHost,
      port: phpPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${phpHost}:${phpPort}`,
        'x-forwarded-proto': 'http',
        'x-forwarded-host': req.headers.host || `${publicHost}:${publicPort}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'PHP backend is unavailable.', meta: { detail: error.message } }));
  });

  req.pipe(proxyReq);
}

function startBootstrap() {
  if (dbDriver !== 'sqlite') {
    return;
  }

  const result = spawnSync(phpBin, [path.join(__dirname, 'bootstrap.php')], {
    cwd: rootDir,
    env: phpEnv,
    stdio: 'inherit',
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      failStartup(
        'PHP runtime not found. Add runtime/php/windows/php.exe or set PARTY_PHP_BIN to a PHP executable.'
      );
    }

    failStartup(`Failed to start PHP bootstrap: ${result.error.message}`);
  }

  if (result.status !== 0) {
    failStartup(`PHP bootstrap exited with code ${result.status || 1}.`);
  }
}

function waitForPhp(retries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      const probe = http.request(
        {
          hostname: phpHost,
          port: phpPort,
          path: '/api',
          method: 'GET',
        },
        (response) => {
          response.resume();
          resolve();
        }
      );

      probe.on('error', () => {
        if (remaining <= 0) {
          reject(new Error('Timed out waiting for PHP server startup.'));
          return;
        }

        setTimeout(() => attempt(remaining - 1), 250);
      });

      probe.end();
    };

    attempt(retries);
  });
}

async function main() {
  ensureDir(dataDir);
  ensureDir(sessionDir);

  console.log(explainPhpRuntime());

  startBootstrap();

  const phpProcess = spawn(phpBin, ['-S', `${phpHost}:${phpPort}`, path.join(__dirname, 'php-router.php')], {
    cwd: rootDir,
    env: phpEnv,
    stdio: 'inherit',
  });

  const stop = () => {
    if (!phpProcess.killed) {
      phpProcess.kill();
    }
  };

  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });

  phpProcess.on('error', (error) => {
    if (error.code === 'ENOENT') {
      failStartup('PHP runtime not found. Add runtime/php/windows/php.exe or set PARTY_PHP_BIN to a PHP executable.');
    }

    failStartup(`Failed to start PHP server: ${error.message}`);
  });

  phpProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`PHP server exited with code ${code}.`);
      process.exit(code || 1);
    }
  });

  await waitForPhp();

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${publicHost}:${publicPort}`}`);
    if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
      proxyToPhp(req, res);
      return;
    }

    if ((req.method || 'GET') !== 'GET' && (req.method || 'GET') !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed.');
      return;
    }

    const resolved = resolvePublicPath(decodeURIComponent(requestUrl.pathname));
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      serveFile(res, resolved);
      return;
    }

    serveFile(res, path.join(rootDir, 'index.html'));
  });

  server.listen(publicPort, publicHost, () => {
    console.log(`Party host listening on http://${publicHost}:${publicPort}`);
    console.log(`PHP backend listening on http://${phpHost}:${phpPort}`);
    if (!fs.existsSync(bundledPhp)) {
      console.log('Bundled PHP runtime not found. Set PARTY_PHP_BIN or add runtime/php/windows/php.exe.');
    }
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
const fs = require('fs');
const path = require('path');

function prepareDisposableServerEnv(options = {}) {
  const rootDir = path.resolve(__dirname, '..');
  const scope = options.scope || 'e2e';
  const runRoot = path.join(rootDir, '.tmp', scope, 'current');
  const publicHost = options.publicHost || process.env.PARTY_HOST || '127.0.0.1';
  const publicPort = String(options.publicPort || process.env.PARTY_HOST_PORT || '3200');
  const phpHost = options.phpHost || process.env.PARTY_PHP_HOST || '127.0.0.1';
  const phpPort = String(options.phpPort || process.env.PARTY_PHP_PORT || '3201');

  fs.rmSync(runRoot, { recursive: true, force: true });
  fs.mkdirSync(runRoot, { recursive: true });

  process.env.PARTY_HOST = publicHost;
  process.env.PARTY_HOST_PORT = publicPort;
  process.env.PARTY_PHP_HOST = phpHost;
  process.env.PARTY_PHP_PORT = phpPort;
  process.env.PARTY_DB_DRIVER = 'sqlite';
  process.env.PARTY_DB_SQLITE_PATH = path.join(runRoot, 'party.sqlite');
  process.env.PARTY_SESSION_SAVE_PATH = path.join(runRoot, 'sessions');
  process.env.PARTY_AUTH_ENFORCE_HTTPS = '0';

  return {
    rootDir,
    runRoot,
    baseURL: `http://${publicHost}:${publicPort}`,
    publicHost,
    publicPort,
    phpHost,
    phpPort,
    sqlitePath: process.env.PARTY_DB_SQLITE_PATH,
    sessionPath: process.env.PARTY_SESSION_SAVE_PATH,
  };
}

module.exports = {
  prepareDisposableServerEnv,
};
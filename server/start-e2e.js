const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const runRoot = path.join(rootDir, '.tmp', 'e2e', 'current');
const publicHost = process.env.PARTY_HOST || '127.0.0.1';
const publicPort = process.env.PARTY_HOST_PORT || '3200';
const phpHost = process.env.PARTY_PHP_HOST || '127.0.0.1';
const phpPort = process.env.PARTY_PHP_PORT || '3201';

// Each E2E run gets disposable DB and session storage so tests never mutate normal local state.
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

require('./index.js');

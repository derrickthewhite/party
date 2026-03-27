const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, expect, request } = require('@playwright/test');
const { buildCredentials } = require('./helpers/partyApp');
const { buildSignupPayload, startClientHandshake } = require('./helpers/srpNode');
const { ensureArtifactRoot, storageStatePath, writeCredentials } = require('./helpers/sessionArtifacts');

test.setTimeout(180000);

const rootDir = path.resolve(__dirname, '..');
const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
const sqlitePath = process.env.PARTY_DB_SQLITE_PATH || path.join(rootDir, '.tmp', 'e2e', 'current', 'party.sqlite');

function baseURL() {
  return process.env.PARTY_E2E_BASE_URL
    || `http://${process.env.PARTY_HOST || '127.0.0.1'}:${process.env.PARTY_HOST_PORT || '3200'}`;
}

async function signupAndSigninViaApi(label, artifactName) {
  const credentials = buildCredentials(label);
  const api = await request.newContext({
    baseURL: baseURL(),
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  });

  try {
    const signupPayload = await buildSignupPayload(credentials.username, credentials.password);
    const signupResponse = await api.post('/api/auth/signup', {
      data: {
        username: signupPayload.username,
        salt: signupPayload.salt,
        verifier: signupPayload.verifier,
        invite_key: 'local',
      },
    });
    expect(signupResponse.ok()).toBeTruthy();

    const signinStartResponse = await api.post('/api/auth/signin/start', {
      data: { username: credentials.username },
    });
    expect(signinStartResponse.ok()).toBeTruthy();
    const signinStart = await signinStartResponse.json();

    const handshake = await startClientHandshake(credentials.username, credentials.password, signinStart.data);
    const signinFinishResponse = await api.post('/api/auth/signin/finish', {
      data: {
        username: credentials.username,
        client_public: handshake.clientPublic,
        client_proof: handshake.clientProof,
      },
    });
    expect(signinFinishResponse.ok()).toBeTruthy();

    await api.storageState({ path: storageStatePath(artifactName) });
    writeCredentials(artifactName, credentials);
    return credentials;
  } finally {
    await api.dispose();
  }
}

function resolvePhpBin() {
  if (process.env.PARTY_PHP_BIN) {
    return process.env.PARTY_PHP_BIN;
  }

  if (fs.existsSync(bundledPhp)) {
    return bundledPhp;
  }

  return 'php';
}

function promoteUserToAdmin(username) {
  const php = resolvePhpBin();
  const script = [
    '$username = $argv[1] ?? "";',
    '$dbPath = $argv[2] ?? "";',
    'if ($username === "" || $dbPath === "") { fwrite(STDERR, "Missing admin promotion arguments.\n"); exit(1); }',
    '$pdo = new PDO("sqlite:" . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);',
    '$stmt = $pdo->prepare("UPDATE users SET is_admin = 1 WHERE username = :username");',
    '$stmt->execute(["username" => $username]);',
    'if ((int)$stmt->rowCount() !== 1) { fwrite(STDERR, "Expected exactly one user to be promoted.\n"); exit(1); }',
  ].join(' ');

  const result = spawnSync(php, ['-r', script, username, sqlitePath], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Unable to promote E2E admin user.').trim());
  }
}

test('prepare shared authenticated users', async () => {
  ensureArtifactRoot();

  await signupAndSigninViaApi('returning-user', 'returning-user');
  const creator = await signupAndSigninViaApi('creator', 'creator');
  await signupAndSigninViaApi('alice', 'alice');
  await signupAndSigninViaApi('bob', 'bob');

  promoteUserToAdmin(creator.username);
});
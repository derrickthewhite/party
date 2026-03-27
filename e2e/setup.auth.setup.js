const { test, expect, request } = require('@playwright/test');
const { buildCredentials } = require('./helpers/partyApp');
const { buildSignupPayload, startClientHandshake } = require('./helpers/srpNode');
const { ensureArtifactRoot, storageStatePath, writeCredentials } = require('./helpers/sessionArtifacts');

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
  } finally {
    await api.dispose();
  }
}

test('prepare shared authenticated users', async () => {
  ensureArtifactRoot();

  await signupAndSigninViaApi('returning-user', 'returning-user');
  await signupAndSigninViaApi('creator', 'creator');
  await signupAndSigninViaApi('alice', 'alice');
  await signupAndSigninViaApi('bob', 'bob');
});
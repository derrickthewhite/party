const { buildSignupPayload, startClientHandshake } = require('../../test-support/srp-node');
const { createApiClient } = require('./api-client');

function buildCredentials(label) {
  const stamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  const username = `${label}-${stamp}-${suffix}`.toLowerCase().slice(0, 32);

  return {
    username,
    password: `pw-${stamp}-${suffix}`,
  };
}

async function signUp(client, credentials) {
  const signupPayload = await buildSignupPayload(credentials.username, credentials.password);
  return client.post('/api/auth/signup', {
    json: {
      username: signupPayload.username,
      salt: signupPayload.salt,
      verifier: signupPayload.verifier,
      invite_key: 'local',
    },
  });
}

async function signIn(client, credentials) {
  const signinStartResponse = await client.post('/api/auth/signin/start', {
    json: { username: credentials.username },
  });

  if (!signinStartResponse.ok) {
    return signinStartResponse;
  }

  const handshake = await startClientHandshake(
    credentials.username,
    credentials.password,
    signinStartResponse.body.data
  );

  return client.post('/api/auth/signin/finish', {
    json: {
      username: credentials.username,
      client_public: handshake.clientPublic,
      client_proof: handshake.clientProof,
    },
  });
}

async function registerAndSignIn(baseURL, label) {
  const client = createApiClient(baseURL);
  const credentials = buildCredentials(label);

  const signupResponse = await signUp(client, credentials);
  if (!signupResponse.ok) {
    throw new Error(`Signup failed with ${signupResponse.status}: ${signupResponse.text}`);
  }

  const signinResponse = await signIn(client, credentials);
  if (!signinResponse.ok) {
    throw new Error(`Signin failed with ${signinResponse.status}: ${signinResponse.text}`);
  }

  return { client, credentials, signupResponse, signinResponse };
}

module.exports = {
  buildCredentials,
  registerAndSignIn,
  signIn,
  signUp,
};
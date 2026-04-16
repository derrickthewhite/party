const { createApiClient } = require('./support/api-client');
const { buildCredentials, registerAndSignIn, signIn, signUp } = require('./support/auth');
const { getServerInfo } = require('./support/server-runtime');

test('user can sign up, sign in, fetch auth me, and sign out', async () => {
  const baseURL = getServerInfo().baseURL;
  const { client, credentials } = await registerAndSignIn(baseURL, 'auth-user');

  const meResponse = await client.get('/api/auth/me');
  expect(meResponse.status).toBe(200);
  expect(meResponse.body.ok).toBe(true);
  expect(meResponse.body.data.user.username).toBe(credentials.username);

  const signoutResponse = await client.post('/api/auth/signout');
  expect(signoutResponse.status).toBe(200);
  expect(signoutResponse.body).toEqual({
    ok: true,
    data: {
      message: 'Signed out.',
    },
  });

  const afterSignoutResponse = await client.get('/api/auth/me');
  expect(afterSignoutResponse.status).toBe(401);
  expect(afterSignoutResponse.body.error).toBe('Unauthorized.');
});

test('duplicate signup is rejected', async () => {
  const client = createApiClient(getServerInfo().baseURL);
  const credentials = buildCredentials('dupe-user');

  const firstSignup = await signUp(client, credentials);
  expect(firstSignup.status).toBe(201);

  const secondSignup = await signUp(createApiClient(getServerInfo().baseURL), credentials);
  expect(secondSignup.status).toBe(409);
  expect(secondSignup.body.error).toBe('Username is already taken.');
});

test('invalid password cannot complete sign in', async () => {
  const baseURL = getServerInfo().baseURL;
  const credentials = buildCredentials('wrong-password');
  const signupClient = createApiClient(baseURL);
  const signupResponse = await signUp(signupClient, credentials);
  expect(signupResponse.status).toBe(201);

  const wrongClient = createApiClient(baseURL);
  const wrongSignin = await signIn(wrongClient, {
    username: credentials.username,
    password: `${credentials.password}-bad`,
  });

  expect(wrongSignin.status).toBe(401);
  expect(wrongSignin.body.error).toBe('Invalid credentials.');
});
const { createApiClient } = require('./support/api-client');
const { getServerInfo } = require('./support/server-runtime');

test('api health endpoint responds', async () => {
  const client = createApiClient(getServerInfo().baseURL);
  const response = await client.get('/api');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    ok: true,
    data: {
      service: 'party-api',
      version: 1,
    },
  });
});
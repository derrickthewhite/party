const { startTestServer, stopTestServer } = require('./server-runtime');

beforeAll(async () => {
  await startTestServer();
});

afterAll(async () => {
  await stopTestServer();
});
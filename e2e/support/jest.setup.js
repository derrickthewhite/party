const { startTestServer, stopTestServer } = require('../../api-tests/support/server-runtime');
const { startBrowser, stopBrowser } = require('./browser-runtime');

beforeAll(async () => {
  await startTestServer();
  await startBrowser();
});

afterAll(async () => {
  await stopBrowser();
  await stopTestServer();
});
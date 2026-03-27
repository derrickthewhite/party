const { defineConfig } = require('@playwright/test');

const host = process.env.PARTY_HOST || '127.0.0.1';
const port = Number(process.env.PARTY_HOST_PORT || 3200);
const baseURL = process.env.PARTY_E2E_BASE_URL || `http://${host}:${port}`;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  projects: [
    {
      name: 'setup',
      testMatch: /setup\.auth\.setup\.js/,
    },
    {
      name: 'auth',
      testMatch: /auth\.spec\.js/,
      dependencies: ['setup'],
    },
    {
      name: 'games',
      testMatch: /games\.spec\.js/,
      dependencies: ['setup'],
    },
    {
      name: 'rumble',
      testMatch: /rumble\.spec\.js/,
      dependencies: ['setup'],
    },
  ],
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/start-e2e.js',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});

const { registerAndSignIn } = require('../api-tests/support/auth');
const { getServerInfo } = require('../api-tests/support/server-runtime');
const { createPage } = require('./support/browser-runtime');

function parseCookieHeader(cookieHeader) {
  const firstPair = String(cookieHeader || '').split(';')[0].trim();
  const separatorIndex = firstPair.indexOf('=');
  if (separatorIndex <= 0) {
    throw new Error('Missing session cookie header for browser test.');
  }

  return {
    name: firstPair.slice(0, separatorIndex),
    value: firstPair.slice(separatorIndex + 1),
  };
}

test('authenticated browser session lands on the game lobby', async () => {
  const { baseURL } = getServerInfo();
  const user = await registerAndSignIn(baseURL, 'browser-smoke');
  const page = await createPage();
  const sessionCookie = parseCookieHeader(user.client.cookieHeader);

  try {
    await page.setCookie({
      ...sessionCookie,
      url: baseURL,
    });

    await page.goto(baseURL, { waitUntil: 'networkidle0' });
    await page.waitForFunction(
      () => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        if (!activeScreen) {
          return false;
        }

        const heading = activeScreen.querySelector('h2');
        return !!heading && heading.textContent.trim() === 'Game Lobby';
      },
      { timeout: 15000 }
    );

    const lobbyTitle = await page.$eval('.screen:not(.hidden) h2', (node) => node.textContent.trim());
    expect(lobbyTitle).toBe('Game Lobby');
  } finally {
    await page.close();
  }
});
const { expect } = require('@playwright/test');

const INVITE_KEY = 'local';
const DEFAULT_TIMEOUT = 30000;
const AUTH_TIMEOUT = 60000;

function activeScreen(page, headingName) {
  return page.locator('section.screen:not(.hidden)').filter({
    has: page.getByRole('heading', { name: headingName, exact: true }),
  });
}

async function waitForVisible(locator, timeout) {
  await expect(locator).toBeVisible({ timeout: timeout || DEFAULT_TIMEOUT });
}

async function waitForAppToSettle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

function buildCredentials(label) {
  const stamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  const username = `${label}-${stamp}-${suffix}`.toLowerCase().slice(0, 32);
  return {
    username,
    password: `pw-${stamp}-${suffix}`,
  };
}

async function gotoWelcome(page) {
  await page.goto('/');
  await waitForAppToSettle(page);
  await waitForVisible(activeScreen(page, 'Party'));
}

async function openSignup(page) {
  const welcome = activeScreen(page, 'Party');
  await welcome.getByRole('button', { name: 'Create account', exact: true }).click();
  await waitForVisible(page.locator('#signup-username'));
}

async function openSignin(page) {
  const welcome = activeScreen(page, 'Party');
  await welcome.getByRole('button', { name: 'Sign in', exact: true }).click();
  await waitForVisible(page.locator('#signin-username'));
}

async function signUp(page, credentials) {
  await openSignup(page);
  const signup = activeScreen(page, 'Signup');
  const usernameInput = page.locator('#signup-username');
  const passwordInput = page.locator('#signup-password');
  const inviteInput = page.locator('#signup-invite');

  await waitForVisible(usernameInput);
  await usernameInput.fill(credentials.username);
  await passwordInput.fill(credentials.password);
  await inviteInput.fill(INVITE_KEY);
  await signup.getByRole('button', { name: 'Create account', exact: true }).click();

  await waitForVisible(page.locator('#signin-username'), AUTH_TIMEOUT);
}

async function signIn(page, credentials) {
  const signin = activeScreen(page, 'Signin');
  const usernameInput = page.locator('#signin-username');
  const passwordInput = page.locator('#signin-password');

  await waitForVisible(usernameInput, AUTH_TIMEOUT);

  await usernameInput.fill(credentials.username);
  await passwordInput.fill(credentials.password);
  await signin.getByRole('button', { name: 'Sign in', exact: true }).click();

  const lobby = activeScreen(page, 'Game Lobby');
  await waitForVisible(lobby, AUTH_TIMEOUT);
  await expect(lobby.locator('.top-user-label')).toHaveText(`Signed in as: ${credentials.username}`, { timeout: AUTH_TIMEOUT });
}

async function registerAndSignIn(page, label) {
  const credentials = buildCredentials(label);
  await gotoWelcome(page);
  await signUp(page, credentials);
  await signIn(page, credentials);
  return credentials;
}

async function createGame(page, title, gameType) {
  const lobby = activeScreen(page, 'Game Lobby');
  await waitForVisible(lobby, AUTH_TIMEOUT);

  await lobby.getByPlaceholder('Game Title').fill(title);
  await lobby.locator('select').selectOption(gameType);
  await lobby.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(lobby.locator('.status')).toHaveText('Game created.', { timeout: DEFAULT_TIMEOUT });
  const row = lobby.locator('.game-item').filter({ hasText: `${title} (${gameType})` });
  await waitForVisible(row, DEFAULT_TIMEOUT);
  return row;
}

async function reloadLobby(page, username) {
  await page.reload();
  await waitForAppToSettle(page);
  const lobby = activeScreen(page, 'Game Lobby');
  await waitForVisible(lobby, AUTH_TIMEOUT);
  await expect(lobby.locator('.top-user-label')).toHaveText(`Signed in as: ${username}`, { timeout: AUTH_TIMEOUT });
}

async function createUserSession(browser, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const credentials = await registerAndSignIn(page, label);
  return { context, page, credentials };
}

// Test-only helper: creates an authenticated browser storage snapshot so later specs can skip repeated UI auth setup.
async function createStoredSession(browser, label, storageStatePath) {
  const session = await createUserSession(browser, label);
  await session.context.storageState({ path: storageStatePath });
  await session.context.close();
  return {
    credentials: session.credentials,
    storageStatePath,
  };
}

// Test-only helper: reopens a previously captured authenticated session for faster E2E flows.
async function openStoredSession(browser, storageStatePath, username) {
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();
  await page.goto('/');
  await waitForAppToSettle(page);

  const lobby = activeScreen(page, 'Game Lobby');
  await waitForVisible(lobby, AUTH_TIMEOUT);
  if (username) {
    await expect(lobby.locator('.top-user-label')).toHaveText(`Signed in as: ${username}`, { timeout: AUTH_TIMEOUT });
  }

  return { context, page };
}

module.exports = {
  activeScreen,
  buildCredentials,
  createGame,
  createStoredSession,
  createUserSession,
  gotoWelcome,
  openStoredSession,
  openSignin,
  openSignup,
  reloadLobby,
  registerAndSignIn,
  signIn,
  signUp,
};

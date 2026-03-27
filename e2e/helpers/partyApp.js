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

function lobbyGameRow(page, title, gameType) {
  const lobby = activeScreen(page, 'Game Lobby');
  return lobby.locator('.game-item').filter({ hasText: `${title} (${gameType})` }).first();
}

function rumbleGameScreen(page, title) {
  return activeScreen(page, `${title} (Rumble)`);
}

async function clickLobbyRefresh(page) {
  const lobby = activeScreen(page, 'Game Lobby');
  await waitForVisible(lobby, AUTH_TIMEOUT);

  const refreshButtons = lobby.getByRole('button', { name: 'Refresh', exact: true });
  const refreshCount = await refreshButtons.count();
  if (refreshCount === 0) {
    return lobby;
  }

  const refreshBtn = refreshButtons.last();
  if (await refreshBtn.isVisible() && await refreshBtn.isEnabled()) {
    await refreshBtn.click();
  }
  return lobby;
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

  const row = lobby.locator('.game-item').filter({ hasText: `${title} (${gameType})` });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await row.count()) > 0 && await row.first().isVisible()) {
      return row;
    }
    await clickLobbyRefresh(page);
  }

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

async function confirmModal(page, confirmLabel) {
  const dialog = page.getByRole('dialog');
  await waitForVisible(dialog, DEFAULT_TIMEOUT);
  await dialog.getByRole('button', { name: confirmLabel || 'Confirm', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: DEFAULT_TIMEOUT });
}

async function joinGameFromLobby(page, title, gameType) {
  const row = lobbyGameRow(page, title, gameType);
  await waitForVisible(row, DEFAULT_TIMEOUT);
  await row.getByRole('button', { name: 'Join', exact: true }).click();
  const updatedRow = lobbyGameRow(page, title, gameType);
  await waitForVisible(updatedRow, DEFAULT_TIMEOUT);
  await expect(updatedRow.getByRole('button', { name: 'Open', exact: true })).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  return updatedRow;
}

async function openGameFromLobby(page, title, gameType, headingName) {
  const row = lobbyGameRow(page, title, gameType);
  await waitForVisible(row, DEFAULT_TIMEOUT);
  await row.getByRole('button', { name: 'Open', exact: true }).click();
  await waitForVisible(activeScreen(page, headingName), AUTH_TIMEOUT);
}

async function startGameFromLobby(page, title, gameType) {
  const row = lobbyGameRow(page, title, gameType);
  await waitForVisible(row, DEFAULT_TIMEOUT);
  await row.getByRole('button', { name: 'Start', exact: true }).click();
  await confirmModal(page, 'Confirm');
  const updatedRow = lobbyGameRow(page, title, gameType);
  await expect(updatedRow).toContainText('Status: in_progress', { timeout: DEFAULT_TIMEOUT });
  return updatedRow;
}

async function setAdminUiEnabled(page, enabled) {
  const lobby = activeScreen(page, 'Game Lobby');
  const toggle = lobby.getByRole('button', { name: /Admin UI:/ });
  await waitForVisible(toggle, DEFAULT_TIMEOUT);
  const expected = enabled ? 'Admin UI: On' : 'Admin UI: Off';
  const currentText = String((await toggle.textContent()) || '').trim();
  if (currentText !== expected) {
    await toggle.click();
  }
  await expect(toggle).toHaveText(expected, { timeout: DEFAULT_TIMEOUT });
}

async function clickRumbleRefresh(page, title) {
  const screen = rumbleGameScreen(page, title);
  await waitForVisible(screen, AUTH_TIMEOUT);

  const refreshBtn = screen.locator('[data-ref="refreshBtn"]');
  await waitForVisible(refreshBtn, DEFAULT_TIMEOUT);
  const currentText = String((await refreshBtn.textContent()) || '').trim();

  if (currentText === 'Refresh' && await refreshBtn.isEnabled()) {
    await refreshBtn.click();
    await expect(refreshBtn).toHaveText('Refreshing...', { timeout: DEFAULT_TIMEOUT });
  }

  try {
    await expect(refreshBtn).toHaveText('Refresh', { timeout: 5000 });
  } catch (err) {
    // Some refresh paths overlap with the screen's own auto-refresh. In that case,
    // the caller still made an explicit refresh attempt and can continue checking state.
  }

  return screen;
}

async function waitForRumblePhase(page, title, phaseName) {
  let screen = rumbleGameScreen(page, title);
  await waitForVisible(screen, AUTH_TIMEOUT);

  let phaseTitle = screen.locator('[data-ref="phaseTitle"]');
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const currentPhase = String((await phaseTitle.textContent()) || '').trim();
    if (currentPhase === phaseName) {
      return screen;
    }

    screen = await clickRumbleRefresh(page, title);
    phaseTitle = screen.locator('[data-ref="phaseTitle"]');
  }

  await expect(phaseTitle).toHaveText(phaseName, { timeout: 1000 });
  return screen;
}

async function waitForRumbleActionEnabled(page, title, buttonName) {
  let screen = rumbleGameScreen(page, title);
  await waitForVisible(screen, AUTH_TIMEOUT);

  let actionBtn = screen.getByRole('button', { name: buttonName, exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await actionBtn.count()) > 0 && await actionBtn.isVisible() && await actionBtn.isEnabled()) {
      return screen;
    }

    screen = await clickRumbleRefresh(page, title);
    actionBtn = screen.getByRole('button', { name: buttonName, exact: true });
  }

  await expect(actionBtn).toBeEnabled({ timeout: 1000 });
  return screen;
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
  clickLobbyRefresh,
  confirmModal,
  createGame,
  createStoredSession,
  createUserSession,
  gotoWelcome,
  joinGameFromLobby,
  lobbyGameRow,
  openStoredSession,
  openGameFromLobby,
  openSignin,
  openSignup,
  reloadLobby,
  registerAndSignIn,
  rumbleGameScreen,
  setAdminUiEnabled,
  signIn,
  signUp,
  startGameFromLobby,
  clickRumbleRefresh,
  waitForRumbleActionEnabled,
  waitForRumblePhase,
};

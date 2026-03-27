const { test, expect } = require('@playwright/test');
const { activeScreen, gotoWelcome, openSignin, registerAndSignIn, signIn } = require('./helpers/partyApp');
const { readCredentials } = require('./helpers/sessionArtifacts');

test('user can sign up and sign in through the live local app', async ({ page }) => {
  const credentials = await registerAndSignIn(page, 'auth-user');
  const lobby = activeScreen(page, 'Game Lobby');

  await expect(lobby.locator('.top-user-label')).toHaveText(`Signed in as: ${credentials.username}`);
  await expect(page).toHaveURL(/screen=landing/);
});

test('existing user can sign back in from the welcome screen', async ({ page }) => {
  const credentials = readCredentials('returning-user');
  await gotoWelcome(page);
  await openSignin(page);
  await signIn(page, credentials);
});

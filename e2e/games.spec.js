const { test, expect } = require('@playwright/test');
const { activeScreen, createGame, openStoredSession, reloadLobby } = require('./helpers/partyApp');
const { readCredentials, storageStatePath } = require('./helpers/sessionArtifacts');

test('signed-in user can create a chat game and open it', async ({ browser }) => {
  const creatorCredentials = readCredentials('creator');
  const session = await openStoredSession(browser, storageStatePath('creator'), creatorCredentials.username);
  const title = `chat-room-${Date.now().toString(36)}`;
  try {
    const row = await createGame(session.page, title, 'chat');

    await expect(row).toContainText(`${title} (chat)`);
    await expect(row).toContainText(`Owner: ${creatorCredentials.username}`);
    await expect(row).toContainText('Players: 1');
    await expect(row).toContainText('Observers: 0');
    await expect(row).toContainText('Status: open');

    await row.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(activeScreen(session.page, `${title} (Chat)`)).toBeVisible({ timeout: 30000 });
  } finally {
    await session.context.close();
  }
});

test('multiple signed-in users can hold separate sessions while one creates a game', async ({ browser }) => {
  const aliceCredentials = readCredentials('alice');
  const bobCredentials = readCredentials('bob');
  const alice = await openStoredSession(browser, storageStatePath('alice'), aliceCredentials.username);
  const bob = await openStoredSession(browser, storageStatePath('bob'), bobCredentials.username);

  try {
    const title = `shared-room-${Date.now().toString(36)}`;
    const aliceRow = await createGame(alice.page, title, 'chat');
    await expect(aliceRow).toContainText(`Owner: ${aliceCredentials.username}`);

    await reloadLobby(bob.page, bobCredentials.username);
    const bobLobby = activeScreen(bob.page, 'Game Lobby');
    const bobRow = bobLobby.locator('.game-item').filter({ hasText: `${title} (chat)` });

    await expect(bobRow).toBeVisible();
    await expect(bobRow).toContainText(`Owner: ${aliceCredentials.username}`);
    await expect(bobRow).toContainText('Players: 1');
    await expect(bobLobby.locator('.top-user-label')).toHaveText(`Signed in as: ${bobCredentials.username}`);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

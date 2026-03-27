const { test, expect } = require('@playwright/test');
const {
  clickRumbleRefresh,
  confirmModal,
  createGame,
  joinGameFromLobby,
  openGameFromLobby,
  openStoredSession,
  reloadLobby,
  rumbleGameScreen,
  setAdminUiEnabled,
  startGameFromLobby,
  waitForRumbleActionEnabled,
  waitForRumblePhase,
} = require('./helpers/partyApp');
const { readCredentials, storageStatePath } = require('./helpers/sessionArtifacts');

test.setTimeout(180000);

function getPlayerRow(screen, username) {
  return screen.locator('[data-ref="battleMount"] [data-ref="playersMount"] .row').filter({ hasText: username }).first();
}

async function expectPlayerHealth(screen, username, health) {
  await expect(getPlayerRow(screen, username)).toContainText(`Health: ${health}`);
}

async function waitForPlayerHealth(page, title, username, health) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const screen = rumbleGameScreen(page, title);
    const row = getPlayerRow(screen, username);
    const rowCount = await row.count();
    if (rowCount > 0) {
      const text = String((await row.textContent()) || '');
      if (text.includes(`Health: ${health}`)) {
        return screen;
      }
    }

    await clickRumbleRefresh(page, title);
  }

  await expect(getPlayerRow(rumbleGameScreen(page, title), username)).toContainText(`Health: ${health}`, { timeout: 1000 });
  return rumbleGameScreen(page, title);
}

async function setAttack(screen, targetUsername, amount) {
  const row = getPlayerRow(screen, targetUsername);
  const input = row.getByPlaceholder('Attack amount');
  await expect(input).toBeVisible();
  await input.fill(String(amount));
}

async function submitBids(screen) {
  await screen.getByRole('button', { name: 'Submit Bids', exact: true }).click();

  const editBtn = screen.getByRole('button', { name: 'Edit Bids', exact: true });
  const phaseTitle = screen.locator('[data-ref="phaseTitle"]');
  await expect.poll(async function readBiddingSubmissionState() {
    const phase = String((await phaseTitle.textContent()) || '').trim();
    if (phase === 'Rumble Combat') {
      return 'combat';
    }

    return await editBtn.isVisible() ? 'submitted' : 'pending';
  }, {
    timeout: 30000,
    intervals: [250, 500, 1000],
  }).not.toBe('pending');
}

async function submitOrders(screen) {
  await screen.getByRole('button', { name: 'Submit Orders', exact: true }).click();

  const editBtn = screen.getByRole('button', { name: 'Edit Orders', exact: true });
  await expect.poll(async function readOrderSubmissionState() {
    return await editBtn.isVisible() ? 'submitted' : 'pending';
  }, {
    timeout: 30000,
    intervals: [250, 500, 1000],
  }).toBe('submitted');
}

async function endBidding(screen) {
  await screen.getByRole('button', { name: 'End Bidding', exact: true }).click();
  await confirmModal(screen.page(), 'End Bidding');
}

async function grantArmor(screen, targetUsername) {
  const toggle = screen.getByRole('button', { name: 'Admin Cheat: Show', exact: true });
  await expect(toggle).toBeVisible();
  await toggle.click();

  const panel = screen.locator('[data-ref="adminCheatPanel"]');
  await expect(panel).toBeVisible();
  await panel.locator('#rumble-admin-cheat-target').selectOption({ label: targetUsername });

  const armorRow = panel.locator('[data-ref="adminCheatAbilityList"] label').filter({ hasText: 'Reduce each incoming attack by 5.' }).first();
  await expect(armorRow).toBeVisible();
  await armorRow.locator('input[type="checkbox"]').check();

  await panel.getByRole('button', { name: 'Grant Selected', exact: true }).click();
  await confirmModal(screen.page(), 'Grant Abilities');
}

async function openStartedRumble(browser, title, options) {
  const config = options || {};
  const creatorCredentials = readCredentials('creator');
  const bobCredentials = readCredentials('bob');
  const creator = await openStoredSession(browser, storageStatePath('creator'), creatorCredentials.username);
  const bob = await openStoredSession(browser, storageStatePath('bob'), bobCredentials.username);

  try {
    await createGame(creator.page, title, 'rumble');

    await reloadLobby(bob.page, bobCredentials.username);
    await joinGameFromLobby(bob.page, title, 'rumble');

    await reloadLobby(creator.page, creatorCredentials.username);
    if (config.enableAdminUi) {
      await setAdminUiEnabled(creator.page, true);
    }

    await startGameFromLobby(creator.page, title, 'rumble');
    await openGameFromLobby(creator.page, title, 'rumble', `${title} (Rumble)`);

    await reloadLobby(bob.page, bobCredentials.username);
    await openGameFromLobby(bob.page, title, 'rumble', `${title} (Rumble)`);

    const creatorScreen = await waitForRumblePhase(creator.page, title, 'Rumble Bidding');
    const bobScreen = await waitForRumblePhase(bob.page, title, 'Rumble Bidding');

    return {
      creator,
      bob,
      creatorCredentials,
      bobCredentials,
      creatorScreen,
      bobScreen,
    };
  } catch (err) {
    await creator.context.close();
    await bob.context.close();
    throw err;
  }
}

test('two players can submit empty rumble bids and reach combat', async ({ browser }) => {
  const title = `rumble-empty-${Date.now().toString(36)}`;
  const session = await openStartedRumble(browser, title);

  try {
    await submitBids(session.creatorScreen);
    await submitBids(session.bobScreen);
    await clickRumbleRefresh(session.creator.page, title);
    await clickRumbleRefresh(session.bob.page, title);
    await endBidding(session.creatorScreen);
    await clickRumbleRefresh(session.creator.page, title);
    await clickRumbleRefresh(session.bob.page, title);

    const creatorCombatScreen = await waitForRumblePhase(session.creator.page, title, 'Rumble Combat');
    await waitForRumblePhase(session.bob.page, title, 'Rumble Combat');

    await expect(creatorCombatScreen.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible();
    await expectPlayerHealth(creatorCombatScreen, session.creatorCredentials.username, 100);
    await expectPlayerHealth(creatorCombatScreen, session.bobCredentials.username, 100);
  } finally {
    await session.creator.context.close();
    await session.bob.context.close();
  }
});

test('admin can grant armor and combat resolves with the correct health totals', async ({ browser }) => {
  const title = `rumble-armor-${Date.now().toString(36)}`;
  const session = await openStartedRumble(browser, title, { enableAdminUi: true });

  try {
    await submitBids(session.creatorScreen);
    await submitBids(session.bobScreen);
    await clickRumbleRefresh(session.creator.page, title);
    await clickRumbleRefresh(session.bob.page, title);
    await endBidding(session.creatorScreen);
    await clickRumbleRefresh(session.creator.page, title);
    await clickRumbleRefresh(session.bob.page, title);

    const creatorCombatScreen = await waitForRumblePhase(session.creator.page, title, 'Rumble Combat');
    const bobCombatScreen = await waitForRumblePhase(session.bob.page, title, 'Rumble Combat');

    await grantArmor(creatorCombatScreen, session.creatorCredentials.username);
    await clickRumbleRefresh(session.creator.page, title);
    await clickRumbleRefresh(session.bob.page, title);

    await expect(getPlayerRow(creatorCombatScreen, session.creatorCredentials.username)).toBeVisible();
    await expectPlayerHealth(creatorCombatScreen, session.creatorCredentials.username, 100);
    await expectPlayerHealth(creatorCombatScreen, session.bobCredentials.username, 100);

    await setAttack(creatorCombatScreen, session.bobCredentials.username, 60);
    await setAttack(bobCombatScreen, session.creatorCredentials.username, 60);

    await submitOrders(creatorCombatScreen);
    await submitOrders(bobCombatScreen);

    await waitForRumbleActionEnabled(session.creator.page, title, 'End Turn');
    await creatorCombatScreen.getByRole('button', { name: 'End Turn', exact: true }).click();
    await confirmModal(session.creator.page, 'End Turn');

    const resolvedScreen = await waitForPlayerHealth(session.bob.page, title, session.creatorCredentials.username, 85);
    await expectPlayerHealth(resolvedScreen, session.bobCredentials.username, 80);
  } finally {
    await session.creator.context.close();
    await session.bob.context.close();
  }
});
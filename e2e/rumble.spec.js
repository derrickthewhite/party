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

function tlog(...args) {
  console.log(new Date().toISOString(), ...args);
}

function toScreenshotSlug(value) {
  return String(value || 'state')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'state';
}

async function attachPageScreenshot(testInfo, page, label, stepName) {
  const slug = toScreenshotSlug(stepName);
  const path = testInfo.outputPath(`${label}-${slug}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`${label}-${slug}`, {
    path,
    contentType: 'image/png',
  });
}

async function attachRumbleSnapshot(testInfo, title, session, stepName) {
  const creatorScreen = rumbleGameScreen(session.creator.page, title);
  const bobScreen = rumbleGameScreen(session.bob.page, title);
  const slug = toScreenshotSlug(stepName);

  async function attachScreenState(page, screen, label) {
    const phaseTitle = screen.locator('[data-ref="phaseTitle"]');
    const battleMount = screen.locator('[data-ref="battleMount"]');
    const phase = String((await phaseTitle.textContent().catch(() => '')) || '').trim();
    const visible = await screen.isVisible().catch(() => false);
    const battleText = String((await battleMount.textContent().catch(() => '')) || '').trim();
    const state = [
      `step: ${stepName}`,
      `label: ${label}`,
      `url: ${page.url()}`,
      `screenVisible: ${visible}`,
      `phase: ${phase || '(missing)'}`,
      '',
      battleText || '(battle mount empty)',
    ].join('\n');

    await testInfo.attach(`${label}-${slug}-state`, {
      body: Buffer.from(state, 'utf8'),
      contentType: 'text/plain',
    });
  }

  await Promise.all([
    attachPageScreenshot(testInfo, session.creator.page, 'creator', stepName),
    attachPageScreenshot(testInfo, session.bob.page, 'bob', stepName),
    attachScreenState(session.creator.page, creatorScreen, 'creator'),
    attachScreenState(session.bob.page, bobScreen, 'bob'),
  ]);
}

async function closeSessionContexts(...sessions) {
  await Promise.allSettled(
    sessions
      .filter(Boolean)
      .map(function mapSession(session) {
        return session.context.close();
      })
  );
}

function getPlayerRow(screen, username) {
  return screen.locator('[data-ref="battleMount"] [data-ref="playersMount"] .row').filter({ hasText: username }).first();
}

async function expectPlayerHealth(screen, username, health) {
  await expect(getPlayerRow(screen, username)).toContainText(`Health: ${health}`);
}

async function waitForPlayerHealth(page, title, username, health) {
  await clickRumbleRefresh(page, title);

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const screen = rumbleGameScreen(page, title);
    const row = getPlayerRow(screen, username);
    const rowCount = await row.count();
	tlog(`waitForPlayerHealth attempt ${attempt + 1}: found ${rowCount} rows for player ${username}`);
    if (rowCount > 0) {
      const text = String((await row.textContent()) || '');
      if (text.includes(`Health: ${health}`)) {
        return screen;
      }
    }

    // Wait briefly for the server-side processing / auto-refresh to update the UI.
    if(attempt % 3 === 2) {
      await page.waitForTimeout(1000);
    } else {
	  await clickRumbleRefresh(page, title);}
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
}

async function submitOrders(screen) {
  await screen.getByRole('button', { name: 'Submit Orders', exact: true }).click();

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
   	 tlog("Creating rumble game from creator session");
     await createGame(creator.page, title, 'rumble');
   	 tlog("Joining rumble game from bob session");
    await reloadLobby(bob.page, bobCredentials.username);
    await joinGameFromLobby(bob.page, title, 'rumble');

	 tlog("enabling admin ui if configured and starting game from creator session");	
    await reloadLobby(creator.page, creatorCredentials.username);
    if (config.enableAdminUi) {
      await setAdminUiEnabled(creator.page, true);
    }

	 tlog("Starting game from creator session");
    await startGameFromLobby(creator.page, title, 'rumble');
	 tlog("Opening game from creator session");
    await openGameFromLobby(creator.page, title, 'rumble', `${title} (Rumble)`);

    await reloadLobby(bob.page, bobCredentials.username);
  	 tlog("Opening game from bob session");
    await openGameFromLobby(bob.page, title, 'rumble', `${title} (Rumble)`);

   tlog("Waiting for both players to reach the bidding phase");
    const creatorScreen = await waitForRumblePhase(creator.page, title, 'Rumble Bidding');
    const bobScreen = await waitForRumblePhase(bob.page, title, 'Rumble Bidding');
   tlog("Both players have reached the bidding phase");

    return {
      creator,
      bob,
      creatorCredentials,
      bobCredentials,
      creatorScreen,
      bobScreen,
    };
  } catch (err) {
    await closeSessionContexts(creator, bob);
    throw err;
  }
}

test('two players can submit empty rumble bids and reach combat', async ({ browser }, testInfo) => {
  const title = `rumble-empty-${Date.now().toString(36)}`;
  const session = await openStartedRumble(browser, title);

  try {
    //await attachRumbleSnapshot(testInfo, title, session, 'initial-bidding');

  	 tlog('Submitting empty bids for both players');
    await submitBids(session.creatorScreen);
    //await attachRumbleSnapshot(testInfo, title, session, 'creator-submitted-bids');

    await submitBids(session.bobScreen);
   //await attachRumbleSnapshot(testInfo, title, session, 'bob-submitted-bids');

  	 tlog('Refreshing to process bids and move to combat phase');
    await clickRumbleRefresh(session.creator.page, title);
    await clickRumbleRefresh(session.bob.page, title);
    //await attachRumbleSnapshot(testInfo, title, session, 'after-submit-refresh');

  	 tlog('Ending bidding phase');
    // the refresh after both players submit will cause the phase to move to combat

	 tlog("Waiting for both players to reach combat phase");
    const creatorCombatScreen = await waitForRumblePhase(session.creator.page, title, 'Rumble Combat');
    await waitForRumblePhase(session.bob.page, title, 'Rumble Combat');
	//await attachRumbleSnapshot(testInfo, title, session, 'combat-phase');

	 tlog('Both players have reached the combat phase');
    await expect(creatorCombatScreen.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible();
	tlog('getting creator health');
    await expectPlayerHealth(creatorCombatScreen, session.creatorCredentials.username, 100);
	tlog('getting bob health');
    await expectPlayerHealth(creatorCombatScreen, session.bobCredentials.username, 100);
	tlog('done checking health');
  } catch (err) {
    await attachRumbleSnapshot(testInfo, title, session, 'failure');
    throw err;
  } finally {
    await closeSessionContexts(session.creator, session.bob);
  }
});

test('armor test', async ({ browser }) => {
  const title = `rumble-armor-${Date.now().toString(36)}`;
  const session = await openStartedRumble(browser, title, { enableAdminUi: true });

  try {
    tlog('armor test: starting');
    await submitBids(session.creatorScreen);
    tlog('armor test: creator submitted bids');
    await submitBids(session.bobScreen);
    tlog('armor test: bob submitted bids');
    await clickRumbleRefresh(session.creator.page, title);
    tlog('armor test: refreshed creator');
    await clickRumbleRefresh(session.bob.page, title);
    tlog('armor test: refreshed bob');

    const creatorCombatScreen = await waitForRumblePhase(session.creator.page, title, 'Rumble Combat');
    const bobCombatScreen = await waitForRumblePhase(session.bob.page, title, 'Rumble Combat');

    tlog('armor test: granting armor');
    await grantArmor(creatorCombatScreen, session.creatorCredentials.username);
    tlog('armor test: armor granted');
    await clickRumbleRefresh(session.creator.page, title);
    tlog('armor test: refreshed after grant (creator)');
    await clickRumbleRefresh(session.bob.page, title);
    tlog('armor test: refreshed after grant (bob)');

    await expect(getPlayerRow(creatorCombatScreen, session.creatorCredentials.username)).toBeVisible();
    await expectPlayerHealth(creatorCombatScreen, session.creatorCredentials.username, 100);
    await expectPlayerHealth(creatorCombatScreen, session.bobCredentials.username, 100);

    tlog('armor test: setting attacks');
    await setAttack(creatorCombatScreen, session.bobCredentials.username, 60);
    await setAttack(bobCombatScreen, session.creatorCredentials.username, 60);
    tlog('armor test: attacks set');

    await submitOrders(creatorCombatScreen);
    tlog('armor test: creator submitted orders');
    await submitOrders(bobCombatScreen);
    tlog('armor test: bob submitted orders');

    await waitForRumbleActionEnabled(session.creator.page, title, 'End Turn');
    tlog('armor test: ending turn');
    await creatorCombatScreen.getByRole('button', { name: 'End Turn', exact: true }).click();
    await confirmModal(session.creator.page, 'End Turn');
    tlog('armor test: end turn confirmed');

    const resolvedScreen = await waitForPlayerHealth(session.bob.page, title, session.creatorCredentials.username, 85);
    await expectPlayerHealth(resolvedScreen, session.bobCredentials.username, 80);
    tlog('armor test: verification complete');
  } finally {
    await closeSessionContexts(session.creator, session.bob);
  }
});

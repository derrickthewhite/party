const {
  assertNoHorizontalOverflow,
  getContainedOverflowState,
  openAuthenticatedPage,
  reloadPage,
  waitForActiveHeading,
} = require('./support/app-driver');
const {
  createGame,
  createSession,
  endGame,
  endRumbleBidding,
  getGameDetail,
  grantRumbleAbilities,
  joinGame,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { phaseHeadingForGame } = require('./support/surface-expectations');
const { readRumbleSnapshot } = require('./support/surface-snapshots');

describe('rumble presentation coverage', () => {
  test('rumble screen covers bidding, battle, and admin cheat overflow with server-matched player data', async () => {
    const owner = await createSession('rumble-owner', { admin: true });
    const player = await createSession('rumble-player');
    const game = await createGame(owner, 'rumble', uniqueLabel('rumble-game'));

    await joinGame(player, game.id);
    await startGame(owner, game.id);

    let detail = await getGameDetail(owner, game.id);
    await grantRumbleAbilities(owner, game.id, player.user.id, ['turbo_generator', 'cloaking_field']);
    detail = await getGameDetail(owner, game.id);

    const page = await openAuthenticatedPage(owner, { screen: 'game', game: game.id, admin_ui: 1 }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Rumble'));
      await assertNoHorizontalOverflow(page);

      let snapshot = await readRumbleSnapshot(page);
      expect(snapshot.subtitle).toContain(`Phase: ${detail.phase}`);
      expect(snapshot.progressText).toBe(
        `Bidding submissions: ${detail.rumble_turn_progress.submitted_count}/${detail.rumble_turn_progress.participant_count}`
      );
      expect(snapshot.bidHelpVisible).toBe(true);
      expect(snapshot.biddingCount).toBe(detail.rumble_turn_progress.offered_abilities.length);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').text).toBe('Submit Bids');
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').text).toBe('End Bidding');
      expect(snapshot.adminCheatToggleVisible).toBe(true);

      await page.click('[data-ref="adminCheatToggleBtn"]');
      snapshot = await readRumbleSnapshot(page);
      expect(snapshot.adminCheatPanelVisible).toBe(true);
      expect(snapshot.adminTargetOptions).toEqual(
        expect.arrayContaining(detail.rumble_turn_progress.players.map((entry) => entry.ship_name || entry.username))
      );
      expect(snapshot.adminAbilityRows).toBe(detail.rumble_turn_progress.ability_catalog.length);

      const overflow = await getContainedOverflowState(page, '[data-ref="adminCheatAbilityList"]');
      expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
      expect(['auto', 'scroll']).toContain(overflow.overflowY);

      await endRumbleBidding(owner, game.id);
      detail = await getGameDetail(owner, game.id);
      await reloadPage(page, phaseHeadingForGame(detail, 'Rumble'));
      snapshot = await readRumbleSnapshot(page);

      expect(detail.rumble_turn_progress.phase_mode).toBe('battle');
      expect(snapshot.subtitle).toContain(`Phase: ${detail.phase}`);
      expect(snapshot.attackHelpVisible).toBe(true);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').text).toBe('Submit Orders');
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').text).toBe('End Turn');
      expect(snapshot.playerRows.map((entry) => entry.name)).toEqual(
        detail.rumble_turn_progress.players.map((entry) => `${entry.ship_name || entry.username} | Health: ${Math.max(0, Number(entry.health || 0))}`)
      );
      expect(snapshot.playerRows.find((entry) => entry.name.includes(player.user.username) || entry.name.includes(detail.rumble_turn_progress.players.find((item) => item.user_id === player.user.id).ship_name)).abilities).toContain('Turbo Generator');
    } finally {
      await page.close();
    }
  });

  test('rumble screen covers open-lobby and closed read-only presentation states', async () => {
    const owner = await createSession('rumble-state-owner');
    const player = await createSession('rumble-state-player');
    const game = await createGame(owner, 'rumble', uniqueLabel('rumble-state-game'));

    await joinGame(player, game.id);

    let detail = await getGameDetail(owner, game.id);
    const page = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Rumble'));
      await assertNoHorizontalOverflow(page);

      let snapshot = await readRumbleSnapshot(page);
      expect(snapshot.subtitle).toContain('Status: open');
      expect(snapshot.modeInfo).toBe('Game has not started yet: chat is enabled, game actions are disabled.');
      expect(snapshot.bidHelpVisible).toBe(true);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').visible).toBe(false);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').disabled).toBe(true);
      expect(snapshot.adminCheatToggleVisible).toBe(false);

      await startGame(owner, game.id);
      await endGame(owner, game.id);
      detail = await getGameDetail(owner, game.id);
      await reloadPage(page, phaseHeadingForGame(detail, 'Rumble'));
      snapshot = await readRumbleSnapshot(page);

      expect(snapshot.subtitle).toContain('Status: closed');
      expect(snapshot.modeInfo).toBe('Game has ended. Everything is read-only.');
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').visible).toBe(false);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').disabled).toBe(true);
      expect(snapshot.adminCheatToggleVisible).toBe(false);
    } finally {
      await page.close();
    }
  });
});
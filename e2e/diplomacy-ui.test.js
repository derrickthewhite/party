const {
  assertNoHorizontalOverflow,
  openAuthenticatedPage,
  reloadPage,
  waitForActiveHeading,
} = require('./support/app-driver');
const {
  createGame,
  createSession,
  endGame,
  getGameDetail,
  joinGame,
  listActions,
  observeGame,
  revealActions,
  sendAction,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { phaseHeadingForGame } = require('./support/surface-expectations');
const { readDiplomacySnapshot } = require('./support/surface-snapshots');

describe('diplomacy presentation coverage', () => {
  test('diplomacy screen reflects submission progress and revealed orders from the server', async () => {
    const owner = await createSession('dip-owner');
    const player = await createSession('dip-player');
    const game = await createGame(owner, 'diplomacy', uniqueLabel('dip-game'));

    await joinGame(player, game.id);
    await startGame(owner, game.id);

    await sendAction(owner, game.id, 'order', { text: 'Fleet to North Sea' });
    let detail = await getGameDetail(player, game.id);

    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });
    const playerPage = await openAuthenticatedPage(player, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await waitForActiveHeading(playerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await assertNoHorizontalOverflow(ownerPage);

      let snapshot = await readDiplomacySnapshot(ownerPage);
      expect(snapshot.progressText).toBe(
        `Round ${detail.diplomacy_order_progress.round_number} orders submitted: ${detail.diplomacy_order_progress.submitted_count}/${detail.diplomacy_order_progress.participant_count}`
      );
      expect(snapshot.endTurnVisible).toBe(true);
      expect(snapshot.endTurnDisabled).toBe(false);
      expect(snapshot.emptyOrdersVisible).toBe(true);

      await revealActions(owner, game.id);
      detail = await getGameDetail(player, game.id);
      const actions = await listActions(player, game.id);
      await reloadPage(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      snapshot = await readDiplomacySnapshot(ownerPage);

      expect(snapshot.progressText).toBe(
        `Round ${detail.diplomacy_order_progress.round_number} orders submitted: ${detail.diplomacy_order_progress.submitted_count}/${detail.diplomacy_order_progress.participant_count}`
      );
      expect(snapshot.emptyOrdersVisible).toBe(false);
      expect(snapshot.orders).toEqual(
        actions.filter((entry) => entry.action_type === 'order' && entry.revealed_at).map((entry) => ({
          meta: `Round ${entry.round_number} - ${entry.user.username}`,
          text: entry.payload.text,
        }))
      );
    } finally {
      await ownerPage.close();
      await playerPage.close();
    }
  });

  test('diplomacy screen covers open-owner, observer, and closed read-only states', async () => {
    const owner = await createSession('dip-state-owner');
    const observer = await createSession('dip-state-observer');
    const game = await createGame(owner, 'diplomacy', uniqueLabel('dip-state-game'));

    await observeGame(observer, game.id);

    let detail = await getGameDetail(owner, game.id);
    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await assertNoHorizontalOverflow(ownerPage);

      let snapshot = await readDiplomacySnapshot(ownerPage);
      expect(snapshot.subtitle).toContain('Status: open');
      expect(snapshot.modeInfo).toBe('Game has not started yet: chat is enabled, game actions are disabled.');
      expect(snapshot.sendDisabled).toBe(true);
      expect(snapshot.endTurnVisible).toBe(true);
      expect(snapshot.endTurnDisabled).toBe(true);
      expect(snapshot.emptyOrdersText).toBe('No completed rounds yet.');

      await startGame(owner, game.id);
      const observerDetail = await getGameDetail(observer, game.id);
      const observerPage = await openAuthenticatedPage(observer, { screen: 'game', game: game.id }, { viewport: { width: 1280, height: 900 } });
      try {
        await waitForActiveHeading(observerPage, phaseHeadingForGame(observerDetail, 'Diplomacy'));
        snapshot = await readDiplomacySnapshot(observerPage);
        expect(snapshot.modeInfo).toBe('Observer mode: you can read chat and state, but cannot chat or submit actions.');
        expect(snapshot.sendDisabled).toBe(true);
        expect(snapshot.endTurnVisible).toBe(false);
      } finally {
        await observerPage.close();
      }

      await endGame(owner, game.id);
      detail = await getGameDetail(owner, game.id);
      await reloadPage(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      snapshot = await readDiplomacySnapshot(ownerPage);

      expect(snapshot.subtitle).toContain('Status: closed');
      expect(snapshot.modeInfo).toBe('Game has ended. Everything is read-only.');
      expect(snapshot.sendDisabled).toBe(true);
      expect(snapshot.endTurnVisible).toBe(false);
    } finally {
      await ownerPage.close();
    }
  });
});
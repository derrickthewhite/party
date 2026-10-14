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
  observeGame,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { phaseHeadingForGame } = require('./support/surface-expectations');
const { readDiplomacySnapshot } = require('./support/surface-snapshots');

async function submitEmptyOrders(session, game) {
  const detail = await getGameDetail(session, game.id);
  const power = detail.diplomacy && detail.diplomacy.my_power;
  const map = detail.diplomacy && detail.diplomacy.position && detail.diplomacy.position.map;
  const response = await session.client.post(`/api/games/${game.id}/actions/diplomacy-order`, {
    json: {
      action_type: 'order',
      payload: {
        kind: 'diplomacy-orders',
        map,
        power,
        orders: [],
      },
    },
  });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
}

async function waitForDiplomacyBoard(page) {
  await page.waitForFunction(() => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    const host = activeScreen && activeScreen.querySelector('[data-ref="boardHost"]');
    return !!(host && host.querySelector('.diplomacy-board, svg, canvas'));
  }, { timeout: 15000 });
}

describe('diplomacy presentation coverage', () => {
  test('diplomacy screen reflects setup, then live board progress after start', async () => {
    const owner = await createSession('dip-owner');
    const player = await createSession('dip-player');
    const game = await createGame(owner, 'diplomacy', uniqueLabel('dip-game'));

    await joinGame(player, game.id);

    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });
    try {
      let detail = await getGameDetail(owner, game.id);
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await assertNoHorizontalOverflow(ownerPage);

      let snapshot = await readDiplomacySnapshot(ownerPage);
      expect(snapshot.setupVisible).toBe(true);
      expect(snapshot.playVisible).toBe(false);

      await startGame(owner, game.id);
      await submitEmptyOrders(owner, game);
      detail = await getGameDetail(player, game.id);
      await reloadPage(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await waitForDiplomacyBoard(ownerPage);
      snapshot = await readDiplomacySnapshot(ownerPage);
      expect(snapshot.playVisible).toBe(true);
      expect(snapshot.setupVisible).toBe(false);
      expect(snapshot.boardPresent).toBe(true);
      expect(snapshot.historyPrevVisible).toBe(true);
      expect(snapshot.historyNextVisible).toBe(true);
      expect(snapshot.progressText).toContain(`${detail.diplomacy.progress.submitted_count}/${detail.diplomacy.progress.required_count}`);
      expect(snapshot.endTurnVisible).toBe(true);
      expect(snapshot.endTurnDisabled).toBe(false);
    } finally {
      await ownerPage.close();
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
      expect(snapshot.setupVisible).toBe(true);

      await startGame(owner, game.id);
      const observerDetail = await getGameDetail(observer, game.id);
      const observerPage = await openAuthenticatedPage(observer, { screen: 'game', game: game.id }, { viewport: { width: 1280, height: 900 } });
      try {
        await waitForActiveHeading(observerPage, phaseHeadingForGame(observerDetail, 'Diplomacy'));
        await waitForDiplomacyBoard(observerPage);
        snapshot = await readDiplomacySnapshot(observerPage);
        expect(snapshot.modeInfo).toBe('Observer mode: you can read chat and state, but cannot chat or submit actions.');
        expect(snapshot.playVisible).toBe(true);
        expect(snapshot.boardPresent).toBe(true);
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

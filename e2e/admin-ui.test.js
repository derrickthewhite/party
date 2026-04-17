const {
  getLandingRowInfo,
  openAuthenticatedPage,
  waitForActiveHeading,
  waitForText,
} = require('./support/app-driver');
const {
  createGame,
  createSession,
  listGames,
  uniqueLabel,
} = require('./support/game-fixtures');
const { expectedLobbyButtons } = require('./support/surface-expectations');

describe('administrator presentation coverage', () => {
  test('administrator UI toggles privileged controls in the lobby', async () => {
    const owner = await createSession('admin-owner');
    const admin = await createSession('admin-user', { admin: true });
    const game = await createGame(owner, 'chat', uniqueLabel('admin-lobby-game'));

    const page = await openAuthenticatedPage(admin, { screen: 'landing', admin_ui: 1 }, { viewport: { width: 1280, height: 900 } });

    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForText(page, '[data-ref="adminUiToggle"]', 'Admin UI: On');

      let row = await getLandingRowInfo(page, game.title);
      const listedGame = (await listGames(admin)).find((entry) => entry.id === game.id);
      expect(row.start.visible).toBe(expectedLobbyButtons(listedGame, true, true).startVisible);
      expect(row.remove.visible).toBe(expectedLobbyButtons(listedGame, true, true).removeVisible);

      await page.click('[data-ref="adminUiToggle"]');
      await waitForText(page, '[data-ref="adminUiToggle"]', 'Admin UI: Off');
      row = await getLandingRowInfo(page, game.title);
      expect(row.start.visible).toBe(false);
      expect(row.remove.visible).toBe(false);

      const stubOptionVisible = await page.evaluate(() => {
        const option = document.querySelector('[data-ref="stubOption"]');
        return !!option && !option.hidden;
      });
      expect(stubOptionVisible).toBe(false);
    } finally {
      await page.close();
    }
  });
});
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
  listMessages,
  observeGame,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { phaseHeadingForGame } = require('./support/surface-expectations');
const { readChatSnapshot } = require('./support/surface-snapshots');

describe('chat presentation coverage', () => {
  test('chat screen shows server-backed messages, participant lists, and contained feed overflow', async () => {
    const owner = await createSession('chat-owner');
    const player = await createSession('chat-player');
    const observer = await createSession('chat-observer');
    const game = await createGame(owner, 'chat', uniqueLabel('chat-game'));

    await joinGame(player, game.id);
    await observeGame(observer, game.id);
    await startGame(owner, game.id);

    for (let index = 0; index < 18; index += 1) {
      const author = index % 2 === 0 ? owner : player;
      const response = await author.client.post(`/api/games/${game.id}/messages`, {
        json: {
          body: `message-${index}`,
        },
      });
      expect(response.status).toBe(201);
    }

    const detail = await getGameDetail(player, game.id);
    const messages = await listMessages(player, game.id);
    const playerPage = await openAuthenticatedPage(player, { screen: 'game', game: game.id }, { viewport: { width: 1280, height: 900 } });
    const observerPage = await openAuthenticatedPage(observer, { screen: 'game', game: game.id }, { viewport: { width: 1280, height: 900 } });

    try {
      await waitForActiveHeading(playerPage, phaseHeadingForGame(detail, 'Chat'));
      await waitForActiveHeading(observerPage, phaseHeadingForGame(detail, 'Chat'));
      await assertNoHorizontalOverflow(playerPage);

      const playerSnapshot = await readChatSnapshot(playerPage);
      const observerSnapshot = await readChatSnapshot(observerPage);

      expect(playerSnapshot.subtitle).toContain(`Type: ${detail.game_type}`);
      expect(playerSnapshot.subtitle).toContain(`Status: ${detail.status}`);
      expect(playerSnapshot.subtitle).toContain(`Phase: ${detail.phase}`);
      expect(playerSnapshot.subtitle).toContain(`Round: ${detail.current_round}`);
      expect(playerSnapshot.modeInfo).toBe('Game in progress: chat and actions are enabled for active players.');
      expect(playerSnapshot.players.map((entry) => entry.name)).toEqual(
        detail.members.filter((member) => String(member.role).toLowerCase() !== 'observer').map((member) => member.username).sort()
      );
      expect(playerSnapshot.observers.map((entry) => entry.name)).toEqual(
        detail.members.filter((member) => String(member.role).toLowerCase() === 'observer').map((member) => member.username).sort()
      );
      expect(playerSnapshot.messages.map((entry) => entry.body)).toEqual(messages.map((entry) => entry.body));
      expect(playerSnapshot.messages.map((entry) => entry.username)).toEqual(messages.map((entry) => entry.user.username));
      expect(playerSnapshot.sendDisabled).toBe(false);
      expect(observerSnapshot.sendDisabled).toBe(true);
      expect(playerSnapshot.feedScrollHeight).toBeGreaterThan(playerSnapshot.feedClientHeight);
      expect(['auto', 'scroll']).toContain(playerSnapshot.feedOverflowY);
    } finally {
      await playerPage.close();
      await observerPage.close();
    }
  });

  test('chat screen covers open-lobby chat and closed read-only presentation', async () => {
    const owner = await createSession('chat-open-closed-owner');
    const game = await createGame(owner, 'chat', uniqueLabel('chat-open-closed'));

    const openMessageResponse = await owner.client.post(`/api/games/${game.id}/messages`, {
      json: {
        body: 'lobby-message',
      },
    });
    expect(openMessageResponse.status).toBe(201);

    let detail = await getGameDetail(owner, game.id);
    const page = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Chat'));
      await assertNoHorizontalOverflow(page);

      let snapshot = await readChatSnapshot(page);
      expect(snapshot.subtitle).toContain('Status: open');
      expect(snapshot.modeInfo).toBe('Game has not started yet: chat is enabled, game actions are disabled.');
      expect(snapshot.sendDisabled).toBe(false);
      expect(snapshot.messages.map((entry) => entry.body)).toContain('lobby-message');

      await startGame(owner, game.id);
      await endGame(owner, game.id);
      detail = await getGameDetail(owner, game.id);
      await reloadPage(page, phaseHeadingForGame(detail, 'Chat'));
      snapshot = await readChatSnapshot(page);

      expect(snapshot.subtitle).toContain('Status: closed');
      expect(snapshot.modeInfo).toBe('Game has ended. Everything is read-only.');
      expect(snapshot.sendDisabled).toBe(true);
      expect(snapshot.messages.map((entry) => entry.body)).toContain('lobby-message');
    } finally {
      await page.close();
    }
  });
});
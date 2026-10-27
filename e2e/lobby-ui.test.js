const {
  assertNoHorizontalOverflow,
  getLandingRowInfo,
  openAuthenticatedPage,
  waitForActiveHeading,
} = require('./support/app-driver');
const {
  addRoomMembers,
  createGame,
  createRoom,
  createSession,
  endGame,
  joinGame,
  listGames,
  observeGame,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { expectedLobbyButtons } = require('./support/surface-expectations');

describe('lobby presentation coverage', () => {
  test('multi-room users can filter the lobby and All disables create', async () => {
    const admin = await createSession('lobby-room-admin', { admin: true });
    const user = await createSession('lobby-room-user');
    const code = uniqueLabel('room-code').slice(0, 40);
    const roomResponse = await admin.client.post('/api/admin/rooms', {
      json: { name: 'Second', code },
    });
    expect(roomResponse.status).toBe(201);
    const addResponse = await admin.client.post(`/api/admin/rooms/${roomResponse.body.data.room.id}/members`, {
      json: { user_ids: [user.user.id] },
    });
    expect(addResponse.status).toBe(200);

    const page = await openAuthenticatedPage(user, { screen: 'landing' }, { viewport: { width: 1280, height: 900 } });
    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await page.waitForSelector('[data-ref="roomSelect"]', { visible: true });
      const createEnabledBefore = await page.$eval('[data-ref="createBtn"]', (node) => !node.disabled);
      expect(createEnabledBefore).toBe(true);

      await page.select('[data-ref="roomSelect"]', 'all');
      const createEnabledAfter = await page.$eval('[data-ref="createBtn"]', (node) => !node.disabled);
      expect(createEnabledAfter).toBe(false);
    } finally {
      await page.close();
    }
  });

  test('lobby shows the empty-state message when no games are available', async () => {
    const admin = await createSession('lobby-empty-admin', { admin: true });
    const existingGames = await listGames(admin);
    for (const game of existingGames) {
      const deleteResponse = await admin.client.post(`/api/games/${game.id}/delete`);
      expect(deleteResponse.status).toBe(200);
    }

    const user = await createSession('lobby-empty');
    const page = await openAuthenticatedPage(user, { screen: 'landing' }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await assertNoHorizontalOverflow(page);
      await page.waitForFunction(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        if (!activeScreen) {
          return false;
        }

        const emptyNode = activeScreen.querySelector('[data-ref="emptyListNode"]');
        return !!emptyNode && window.getComputedStyle(emptyNode).display !== 'none';
      }, { timeout: 15000 });

      const snapshot = await page.evaluate(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        const emptyNode = activeScreen.querySelector('[data-ref="emptyListNode"]');
        return {
          emptyText: emptyNode ? emptyNode.textContent.trim() : '',
          emptyVisible: !!(emptyNode && window.getComputedStyle(emptyNode).display !== 'none'),
          rowCount: activeScreen.querySelectorAll('.game-item').length,
        };
      });

      expect(snapshot.emptyVisible).toBe(true);
      expect(snapshot.emptyText).toBe('No games yet. Create one to get started.');
      expect(snapshot.rowCount).toBe(0);
    } finally {
      await page.close();
    }
  });

  test('lobby rows mirror server data and button visibility across open, in-progress, and closed games', async () => {
    const owner = await createSession('lobby-owner');
    const player = await createSession('lobby-player');
    const observer = await createSession('lobby-observer');

    const openGame = await createGame(owner, 'chat', uniqueLabel('open-chat'));
    await observeGame(observer, openGame.id);

    const activeGame = await createGame(owner, 'rumble', uniqueLabel('active-rumble'));
    await joinGame(player, activeGame.id);
    await startGame(owner, activeGame.id);

    const closedGame = await createGame(owner, 'diplomacy', uniqueLabel('closed-diplomacy'));
    await startGame(owner, closedGame.id);
    await endGame(owner, closedGame.id);

    const games = await listGames(player);
    const page = await openAuthenticatedPage(player, { screen: 'landing' }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await assertNoHorizontalOverflow(page);

      for (const game of games.filter((entry) => [openGame.id, activeGame.id, closedGame.id].includes(entry.id))) {
        const row = await getLandingRowInfo(page, game.title);
        expect(row).not.toBeNull();
        expect(row.title).toBe(`${game.title} (${game.game_type})`);
        expect(row.ownerInfo).toBe(`Owner: ${game.owner_username}`);
        expect(row.playersInfo).toBe(`Players: ${Number(game.player_count || 0)}`);
        expect(row.observersInfo).toBe(`Observers: ${Number(game.observer_count || 0)}`);
        expect(row.statusInfo).toBe(`Status: ${game.status}`);
        expect(row.progressInfo).toContain(`Phase: ${game.phase}`);
        expect(row.progressInfo).toContain(`Round: ${Number(game.current_round || 0)}`);

        const expectedButtons = expectedLobbyButtons(game, false, true);
        expect(row.join.visible).toBe(expectedButtons.joinVisible);
        expect(row.observe.visible).toBe(expectedButtons.observeVisible);
        expect(row.leave.visible).toBe(expectedButtons.leaveVisible);
        expect(row.open.visible).toBe(expectedButtons.openVisible);
        expect(row.start.visible).toBe(expectedButtons.startVisible);
        expect(row.end.visible).toBe(expectedButtons.endVisible);
        expect(row.remove.visible).toBe(expectedButtons.removeVisible);
        expect(row.start.disabled).toBe(!game.permissions.can_start);
        expect(row.end.disabled).toBe(!game.permissions.can_end);
        expect(row.remove.disabled).toBe(!game.permissions.can_delete);
      }
    } finally {
      await page.close();
    }
  });
});

async function setupMultiRoomUser(label, extraRoomName) {
  const admin = await createSession(`${label}-admin`, { admin: true });
  const user = await createSession(`${label}-user`);
  const extraRoom = await createRoom(admin, extraRoomName || `Zulu ${uniqueLabel('zulu')}`);
  await addRoomMembers(admin, extraRoom.id, [user.user.id]);
  const mainRoom = user.user.rooms[0];
  return { admin, user, extraRoom, mainRoom };
}

async function waitForRoomFilter(page, expectedValue) {
  await page.waitForFunction((value) => {
    const select = document.querySelector('[data-ref="roomSelect"]');
    return !!select && !select.closest('.hidden') && select.value === String(value);
  }, { timeout: 15000 }, String(expectedValue));

  await page.waitForFunction((value) => {
    return new URL(window.location.href).searchParams.get('room') === String(value);
  }, { timeout: 15000 }, String(expectedValue));
}

describe('lobby room routing', () => {
  test('multi-room users land on the room where they have the most active memberships', async () => {
    const { user, extraRoom, mainRoom } = await setupMultiRoomUser('lobby-rank');
    await createGame(user, 'chat', uniqueLabel('main-one'), { roomId: mainRoom.id });
    await createGame(user, 'chat', uniqueLabel('zulu-one'), { roomId: extraRoom.id });
    await createGame(user, 'chat', uniqueLabel('zulu-two'), { roomId: extraRoom.id });

    const page = await openAuthenticatedPage(user, { screen: 'landing' });
    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForRoomFilter(page, extraRoom.id);
    } finally {
      await page.close();
    }
  });

  test('membership ties prefer rooms where the user is a player rather than observer', async () => {
    const { admin, user, extraRoom, mainRoom } = await setupMultiRoomUser('lobby-tie');
    const observed = await createGame(admin, 'chat', uniqueLabel('main-obs'), { roomId: mainRoom.id });
    await observeGame(user, observed.id);
    await createGame(user, 'chat', uniqueLabel('zulu-player'), { roomId: extraRoom.id });

    const page = await openAuthenticatedPage(user, { screen: 'landing' });
    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForRoomFilter(page, extraRoom.id);
    } finally {
      await page.close();
    }
  });

  test('closed games are ignored when ranking the default room', async () => {
    const { user, extraRoom, mainRoom } = await setupMultiRoomUser('lobby-closed', `AAA ${uniqueLabel('aaa')}`);
    const closedOne = await createGame(user, 'chat', uniqueLabel('aaa-closed-1'), { roomId: extraRoom.id });
    const closedTwo = await createGame(user, 'chat', uniqueLabel('aaa-closed-2'), { roomId: extraRoom.id });
    await endGame(user, closedOne.id);
    await endGame(user, closedTwo.id);
    await createGame(user, 'chat', uniqueLabel('main-open'), { roomId: mainRoom.id });

    const page = await openAuthenticatedPage(user, { screen: 'landing' });
    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForRoomFilter(page, mainRoom.id);
    } finally {
      await page.close();
    }
  });

  test('room query param is honored and All survives refresh and returning from a game', async () => {
    const { user, extraRoom, mainRoom } = await setupMultiRoomUser('lobby-url');
    await createGame(user, 'chat', uniqueLabel('zulu-rank'), { roomId: extraRoom.id });
    await createGame(user, 'chat', uniqueLabel('zulu-rank-2'), { roomId: extraRoom.id });
    const mainGame = await createGame(user, 'chat', uniqueLabel('main-share'), { roomId: mainRoom.id });

    const page = await openAuthenticatedPage(user, { screen: 'landing', room: mainRoom.id });
    try {
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForRoomFilter(page, mainRoom.id);

      await page.select('[data-ref="roomSelect"]', 'all');
      await waitForRoomFilter(page, 'all');

      await page.reload({ waitUntil: 'networkidle0' });
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForRoomFilter(page, 'all');

      await page.evaluate((title) => {
        const rows = Array.from(document.querySelectorAll('.game-item'));
        const row = rows.find((item) => {
          const name = item.querySelector('[data-ref="name"]');
          return !!name && name.textContent.includes(title);
        });
        if (!row) {
          throw new Error('Missing game row');
        }
        row.querySelector('[data-ref="open"]').click();
      }, mainGame.title);

      await page.waitForFunction(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        const back = activeScreen && activeScreen.querySelector('[data-ref="back"]');
        return !!back && back.textContent.includes('Back to lobby');
      }, { timeout: 15000 });

      await page.click('.screen:not(.hidden) [data-ref="back"]');
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForRoomFilter(page, 'all');
    } finally {
      await page.close();
    }
  });

  test('returning from a deep-linked game selects that game\'s room', async () => {
    const { user, extraRoom, mainRoom } = await setupMultiRoomUser('lobby-back');
    await createGame(user, 'chat', uniqueLabel('zulu-more-1'), { roomId: extraRoom.id });
    await createGame(user, 'chat', uniqueLabel('zulu-more-2'), { roomId: extraRoom.id });
    const mainGame = await createGame(user, 'chat', uniqueLabel('main-deep'), { roomId: mainRoom.id });

    const page = await openAuthenticatedPage(user, { screen: 'game', game: mainGame.id });
    try {
      await page.waitForFunction(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        const back = activeScreen && activeScreen.querySelector('[data-ref="back"]');
        return !!back && back.textContent.includes('Back to lobby');
      }, { timeout: 15000 });

      await page.click('.screen:not(.hidden) [data-ref="back"]');
      await waitForActiveHeading(page, 'Game Lobby');
      await waitForRoomFilter(page, mainRoom.id);
    } finally {
      await page.close();
    }
  });
});
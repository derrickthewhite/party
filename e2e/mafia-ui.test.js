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
  sendAction,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { phaseHeadingForGame } = require('./support/surface-expectations');
const { readMafiaSnapshot } = require('./support/surface-snapshots');

async function createOpenMafiaGame(prefix) {
  const owner = await createSession(`${prefix}-owner`);
  const playerA = await createSession(`${prefix}-a`);
  const playerB = await createSession(`${prefix}-b`);
  const playerC = await createSession(`${prefix}-c`);
  const sessions = [owner, playerA, playerB, playerC];
  const game = await createGame(owner, 'mafia', uniqueLabel(`${prefix}-game`));

  await joinGame(playerA, game.id);
  await joinGame(playerB, game.id);
  await joinGame(playerC, game.id);

  return {
    game,
    owner,
    playerA,
    playerB,
    playerC,
    sessions,
  };
}

describe('mafia presentation coverage', () => {
  test('mafia lobby shows setup controls and lobby-specific guidance before the game starts', async () => {
    const { game, owner, playerA, sessions } = await createOpenMafiaGame('mafia-open');
    const ownerDetail = await getGameDetail(owner, game.id);
    const playerDetail = await getGameDetail(playerA, game.id);
    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });
    const playerPage = await openAuthenticatedPage(playerA, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(ownerDetail, 'Mafia'));
      await waitForActiveHeading(playerPage, phaseHeadingForGame(playerDetail, 'Mafia'));
      await assertNoHorizontalOverflow(ownerPage);

      const ownerSnapshot = await readMafiaSnapshot(ownerPage);
      const playerSnapshot = await readMafiaSnapshot(playerPage);

      expect(ownerSnapshot.subtitle).toContain('Status: open');
      expect(ownerSnapshot.modeInfo).toBe('Game has not started yet: chat is enabled, game actions are disabled.');
      expect(ownerSnapshot.roleText).toBe('Game has not started yet. Pick an icon and use chat while the lobby is open.');
      expect(ownerSnapshot.phaseText).toBe('The owner needs to start the game before roles are assigned and ready checks appear.');
      expect(ownerSnapshot.progressText).toBe(`Players: ${sessions.length}`);
      expect(ownerSnapshot.setupControlVisible).toBe(true);
      expect(ownerSnapshot.readyCardVisible).toBe(true);
      expect(ownerSnapshot.readyButtonVisible).toBe(false);
      expect(ownerSnapshot.voteCardVisible).toBe(false);

      expect(playerSnapshot.setupControlVisible).toBe(false);
      expect(playerSnapshot.progressText).toBe(`Players: ${sessions.length}`);
    } finally {
      await ownerPage.close();
      await playerPage.close();
    }
  });

  test('mafia screen covers role reveal, day vote, and night vote phases with server-matched status', async () => {
    const { game, owner, sessions } = await createOpenMafiaGame('mafia-flow');

    await startGame(owner, game.id);

    let detailByUser = new Map();
    for (const session of sessions) {
      const detail = await getGameDetail(session, game.id);
      detailByUser.set(session.user.id, detail);
    }

    const startPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      const startDetail = detailByUser.get(owner.user.id);
      await waitForActiveHeading(startPage, phaseHeadingForGame(startDetail, 'Mafia'));
      await assertNoHorizontalOverflow(startPage);

      let snapshot = await readMafiaSnapshot(startPage);
      expect(snapshot.subtitle).toContain(`Phase: ${startDetail.phase}`);
      expect(snapshot.phaseText).toBe(startDetail.mafia_state.phase_instructions);
      expect(snapshot.progressText).toBe(`Ready: ${startDetail.mafia_state.submitted_count}/${startDetail.mafia_state.required_count}`);
      expect(snapshot.readyCardVisible).toBe(true);
      expect(snapshot.voteCardVisible).toBe(false);

      for (const session of sessions) {
        const detail = detailByUser.get(session.user.id);
        await sendAction(session, game.id, detail.mafia_state.submission_action_type, {});
      }

      for (const session of sessions) {
        detailByUser.set(session.user.id, await getGameDetail(session, game.id));
      }

      const dayDetail = detailByUser.get(owner.user.id);
      await reloadPage(startPage, phaseHeadingForGame(dayDetail, 'Mafia'));
      snapshot = await readMafiaSnapshot(startPage);
      expect(dayDetail.mafia_state.phase).toBe('day');
      expect(snapshot.subtitle).toContain(`Phase: ${dayDetail.phase}`);
      expect(snapshot.progressText).toBe(`Votes: ${dayDetail.mafia_state.submitted_count}/${dayDetail.mafia_state.required_count}`);
      expect(snapshot.readyCardVisible).toBe(false);
      expect(snapshot.voteCardVisible).toBe(true);
      expect(snapshot.targetNames.length).toBeGreaterThan(0);

      const mafiaSession = sessions.find((session) => {
        const detail = detailByUser.get(session.user.id);
        return detail.mafia_state.self_role === 'mafia';
      });
      expect(mafiaSession).toBeTruthy();

      const townSessions = sessions.filter((session) => {
        const detail = detailByUser.get(session.user.id);
        return detail.mafia_state.self_role !== 'mafia';
      });
      expect(townSessions.length).toBeGreaterThanOrEqual(3);
      const victimTown = townSessions[0];
      const survivingTown = townSessions[1];
      const secondSurvivingTown = townSessions[2];

      const remainingVoters = [mafiaSession, survivingTown, secondSurvivingTown];
      for (const session of remainingVoters) {
        const detail = detailByUser.get(session.user.id);
        await sendAction(session, game.id, detail.mafia_state.vote_action_type, { target_user_id: victimTown.user.id });
      }

      for (const session of [mafiaSession, survivingTown]) {
        detailByUser.set(session.user.id, await getGameDetail(session, game.id));
      }

      const nightDetail = detailByUser.get(mafiaSession.user.id);
      expect(nightDetail.mafia_state.phase).toBe('night');

      const mafiaPage = await openAuthenticatedPage(mafiaSession, { screen: 'game', game: game.id }, { viewport: { width: 1280, height: 900 } });
      const townPage = await openAuthenticatedPage(survivingTown, { screen: 'game', game: game.id }, { viewport: { width: 1280, height: 900 } });
      try {
        await waitForActiveHeading(mafiaPage, phaseHeadingForGame(nightDetail, 'Mafia'));
        await waitForActiveHeading(townPage, phaseHeadingForGame(detailByUser.get(survivingTown.user.id), 'Mafia'));

        const mafiaSnapshot = await readMafiaSnapshot(mafiaPage);
        const townSnapshot = await readMafiaSnapshot(townPage);
        expect(mafiaSnapshot.subtitle).toContain(`Phase: ${nightDetail.phase}`);
        expect(mafiaSnapshot.voteCardVisible).toBe(true);
        expect(mafiaSnapshot.targetNames.length).toBeGreaterThan(0);
        expect(townSnapshot.voteText).toContain('Night actions are hidden');
      } finally {
        await mafiaPage.close();
        await townPage.close();
      }
    } finally {
      await startPage.close();
    }
  });

  test('mafia screen shows a closed read-only state after the game is ended', async () => {
    const { game, owner } = await createOpenMafiaGame('mafia-closed');

    await startGame(owner, game.id);
    await endGame(owner, game.id);

    const detail = await getGameDetail(owner, game.id);
    const page = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Mafia'));
      await assertNoHorizontalOverflow(page);

      const snapshot = await readMafiaSnapshot(page);
      expect(snapshot.subtitle).toContain('Status: closed');
      expect(snapshot.modeInfo).toBe('Game has ended. Everything is read-only.');
      expect(snapshot.setupControlVisible).toBe(false);
      if (snapshot.readyButtonVisible) {
        expect(snapshot.readyButtonDisabled).toBe(true);
      }
    } finally {
      await page.close();
    }
  });
});
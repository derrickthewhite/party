// this is not ready to be used yet, do not run or hook up yet.
const { test, expect } = require('@playwright/test');
const {
  activeScreen,
  createGame,
  createUserSession,
  joinGameFromLobby,
  openGameFromLobby,
  openStoredSession,
  reloadLobby,
  startGameFromLobby,
} = require('./helpers/partyApp');
const { readCredentials, storageStatePath } = require('./helpers/sessionArtifacts');

test.setTimeout(180000);

function mafiaGameScreen(page, title) {
  return activeScreen(page, `${title} (Mafia)`);
}

function mafiaPlayerRow(page, title, username) {
  const screen = mafiaGameScreen(page, title);
  return screen.locator('.mafia-target-row').filter({
    has: screen.locator('[data-ref="name"]', { hasText: username }),
  }).first();
}

async function waitForMafiaPhase(page, title, phaseName) {
  const screen = mafiaGameScreen(page, title);
  await expect(screen).toBeVisible({ timeout: 30000 });

  const phaseTitle = screen.locator('[data-ref="phaseTitle"]');
  await expect(phaseTitle).toHaveText(phaseName, { timeout: 30000 });
  return screen;
}

async function readyPlayer(page, title) {
  const screen = await waitForMafiaPhase(page, title, 'Role Reveal');
  const readyBtn = screen.getByRole('button', { name: "I'm Ready", exact: true });
  await expect(readyBtn).toBeVisible({ timeout: 30000 });
  if (await readyBtn.isEnabled()) {
    await readyBtn.click();
  }
}

async function submitMafiaAction(page, title, targetUsername, actionName) {
  const row = mafiaPlayerRow(page, title, targetUsername);
  await expect(row).toBeVisible({ timeout: 30000 });
  const actionRef = actionName === 'Suggest' ? 'suggestBtn' : 'voteBtn';
  const button = row.locator(`[data-ref="${actionRef}"]`);
  await expect(button).toBeVisible({ timeout: 30000 });
  await expect(button).toBeEnabled({ timeout: 30000 });
  await button.click();
}

function mafiaTargetSuggestions(page, title, username) {
  return mafiaPlayerRow(page, title, username).locator('[data-ref="suggestions"]');
}

function mafiaTargetVotes(page, title, username) {
  return mafiaPlayerRow(page, title, username).locator('[data-ref="votes"]');
}

async function sessionRole(session, title) {
  const screen = await waitForMafiaPhase(session.page, title, 'Day Vote');
  const roleText = String((await screen.locator('[data-ref="roleText"]').textContent()) || '');
  return roleText.includes('Mafia') ? 'mafia' : 'town';
}

test('mafia suggestions are public by day and hidden from town at night', async ({ browser }) => {
  const creatorCredentials = readCredentials('creator');
  const aliceCredentials = readCredentials('alice');
  const bobCredentials = readCredentials('bob');

  const creator = await openStoredSession(browser, storageStatePath('creator'), creatorCredentials.username);
  const alice = await openStoredSession(browser, storageStatePath('alice'), aliceCredentials.username);
  const bob = await openStoredSession(browser, storageStatePath('bob'), bobCredentials.username);
  const charlie = await createUserSession(browser, 'mafia-charlie');

  const sessions = [
    { label: 'creator', page: creator.page, context: creator.context, credentials: creatorCredentials },
    { label: 'alice', page: alice.page, context: alice.context, credentials: aliceCredentials },
    { label: 'bob', page: bob.page, context: bob.context, credentials: bobCredentials },
    { label: 'charlie', page: charlie.page, context: charlie.context, credentials: charlie.credentials },
  ];

  try {
    const title = `mafia-live-${Date.now().toString(36)}`;

    await createGame(creator.page, title, 'mafia');

    for (const session of sessions.slice(1)) {
      await reloadLobby(session.page, session.credentials.username);
      await joinGameFromLobby(session.page, title, 'mafia');
    }

    await reloadLobby(creator.page, creatorCredentials.username);
    await startGameFromLobby(creator.page, title, 'mafia');

    for (const session of sessions) {
      await openGameFromLobby(session.page, title, 'mafia', `${title} (Mafia)`);
    }

    for (const session of sessions) {
      await readyPlayer(session.page, title);
    }

    for (const session of sessions) {
      session.role = await sessionRole(session, title);
    }

    const creatorSession = sessions.find((session) => session.label === 'creator');
    const mafiaSession = sessions.find((session) => session.role === 'mafia');
    const townSessions = sessions.filter((session) => session.role === 'town');

    expect(mafiaSession).toBeTruthy();
    expect(townSessions.length).toBe(3);

    const eliminatedTown = townSessions.find((session) => session.credentials.username !== creatorCredentials.username) || townSessions[0];
    const survivingTown = townSessions.find((session) => session.credentials.username !== eliminatedTown.credentials.username);
    const dayObserver = sessions.find((session) => session.credentials.username !== creatorCredentials.username && session.credentials.username !== eliminatedTown.credentials.username) || mafiaSession;
    const daySuggestionTarget = creatorSession.role === 'town'
      ? mafiaSession.credentials.username
      : survivingTown.credentials.username;
    const dayVoteTarget = eliminatedTown.credentials.username;

    await submitMafiaAction(creator.page, title, daySuggestionTarget, 'Suggest');
    await expect(mafiaTargetSuggestions(creator.page, title, daySuggestionTarget)).toHaveText(`Suggested by ${creatorCredentials.username}`);

    await expect(mafiaTargetSuggestions(dayObserver.page, title, daySuggestionTarget)).toHaveText(`Suggested by ${creatorCredentials.username}`, { timeout: 15000 });

    await submitMafiaAction(creator.page, title, dayVoteTarget, 'Vote');
    await expect(mafiaTargetSuggestions(creator.page, title, daySuggestionTarget)).toHaveText(`Suggested by ${creatorCredentials.username}`);
    await expect(mafiaTargetVotes(creator.page, title, dayVoteTarget)).toHaveText(`Voted by ${creatorCredentials.username}`);

    await expect(mafiaTargetSuggestions(dayObserver.page, title, daySuggestionTarget)).toHaveText(`Suggested by ${creatorCredentials.username}`, { timeout: 15000 });
    await expect(mafiaTargetVotes(dayObserver.page, title, dayVoteTarget)).toHaveText(`Voted by ${creatorCredentials.username}`, { timeout: 15000 });

    const supportVoter = creatorSession.role === 'mafia' ? survivingTown : mafiaSession;
      const finalVoter = sessions.find((session) => {
        return session.credentials.username !== creatorCredentials.username
          && session.credentials.username !== supportVoter.credentials.username
          && session.credentials.username !== eliminatedTown.credentials.username;
      });
      const splitVoteTarget = supportVoter.credentials.username !== finalVoter.credentials.username
        ? supportVoter.credentials.username
        : creatorCredentials.username;

    await submitMafiaAction(supportVoter.page, title, dayVoteTarget, 'Vote');
    await submitMafiaAction(eliminatedTown.page, title, creatorCredentials.username, 'Vote');
      await submitMafiaAction(finalVoter.page, title, splitVoteTarget, 'Vote');

    for (const session of sessions) {
      if (session !== mafiaSession && session !== survivingTown && session !== creatorSession) {
        await session.context.close();
        session.closed = true;
      }
    }

    await waitForMafiaPhase(mafiaSession.page, title, 'Night Vote');
    await waitForMafiaPhase(survivingTown.page, title, 'Night Vote');

    const nightTarget = sessions.find((session) => {
      return session.credentials.username !== mafiaSession.credentials.username
        && session.credentials.username !== eliminatedTown.credentials.username;
    });

    await submitMafiaAction(mafiaSession.page, title, nightTarget.credentials.username, 'Suggest');
    await expect(mafiaTargetSuggestions(mafiaSession.page, title, nightTarget.credentials.username)).toHaveText(`Suggested by ${mafiaSession.credentials.username}`);

    await expect(mafiaTargetSuggestions(survivingTown.page, title, nightTarget.credentials.username)).toBeHidden({ timeout: 15000 });
  } finally {
    for (const session of sessions) {
      if (session.closed) {
        continue;
      }
      try {
        await session.context.close();
      } catch (err) {
        // Ignore shutdown races so the original assertion failure stays visible.
      }
    }
  }
});
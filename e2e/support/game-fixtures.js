const { registerAndSignIn } = require('../../api-tests/support/auth');
const { setUserAdmin } = require('../../api-tests/support/admin');
const { getServerInfo } = require('../../api-tests/support/server-runtime');

function uniqueLabel(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchCurrentUser(client) {
  const response = await client.get('/api/auth/me');
  expect(response.status).toBe(200);
  return response.body.data.user;
}

async function createSession(label, options = {}) {
  const { baseURL } = getServerInfo();
  const session = await registerAndSignIn(baseURL, uniqueLabel(label));

  if (options.admin) {
    setUserAdmin(session.credentials.username, true);
  }

  const user = await fetchCurrentUser(session.client);
  return {
    ...session,
    user,
  };
}

async function createGame(ownerSession, gameType, title) {
  const response = await ownerSession.client.post('/api/games', {
    json: {
      title: title || uniqueLabel(gameType),
      game_type: gameType,
    },
  });

  expect(response.status).toBe(201);
  return response.body.data.game;
}

async function joinGame(session, gameId) {
  const response = await session.client.post(`/api/games/${gameId}/join`);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function observeGame(session, gameId) {
  const response = await session.client.post(`/api/games/${gameId}/observe`);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function startGame(session, gameId) {
  const response = await session.client.post(`/api/games/${gameId}/start`);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function endGame(session, gameId) {
  const response = await session.client.post(`/api/games/${gameId}/end`);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function listGames(session) {
  const response = await session.client.get('/api/games');
  expect(response.status).toBe(200);
  return response.body.data.games;
}

async function getGameDetail(session, gameId) {
  const response = await session.client.get(`/api/games/${gameId}`);
  if (response.status !== 200) {
    throw new Error(`Game detail ${gameId} failed with ${response.status}: ${response.text}`);
  }
  return response.body.data.game;
}

async function listMessages(session, gameId) {
  const response = await session.client.get(`/api/games/${gameId}/messages?since_id=0`);
  expect(response.status).toBe(200);
  return response.body.data.messages;
}

async function listActions(session, gameId) {
  const response = await session.client.get(`/api/games/${gameId}/actions?since_id=0`);
  expect(response.status).toBe(200);
  return response.body.data.actions;
}

async function sendAction(session, gameId, actionType, payload = {}) {
  const response = await session.client.post(`/api/games/${gameId}/actions`, {
    json: {
      action_type: actionType,
      payload,
    },
  });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return response.body.data;
}

async function revealActions(session, gameId) {
  const response = await session.client.post(`/api/games/${gameId}/actions/reveal`);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function endRumbleBidding(session, gameId) {
  const response = await session.client.post(`/api/games/${gameId}/actions/rumble-bids/end`);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function grantRumbleAbilities(session, gameId, userId, abilityIds) {
  const response = await session.client.post(`/api/games/${gameId}/actions/rumble-admin-grant-abilities`, {
    json: {
      user_id: userId,
      ability_ids: abilityIds,
    },
  });
  expect(response.status).toBe(200);
  return response.body.data;
}

module.exports = {
  createGame,
  createSession,
  endGame,
  endRumbleBidding,
  fetchCurrentUser,
  getGameDetail,
  grantRumbleAbilities,
  joinGame,
  listActions,
  listGames,
  listMessages,
  observeGame,
  revealActions,
  sendAction,
  startGame,
  uniqueLabel,
};
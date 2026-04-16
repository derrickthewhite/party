const { createApiClient } = require('./support/api-client');
const { registerAndSignIn } = require('./support/auth');
const { getServerInfo } = require('./support/server-runtime');

test('authenticated users can create, list, join, and start a game through the API', async () => {
  const baseURL = getServerInfo().baseURL;
  const owner = await registerAndSignIn(baseURL, 'owner');
  const player = await registerAndSignIn(baseURL, 'player');
  const title = `api-game-${Date.now().toString(36)}`;

  const createResponse = await owner.client.post('/api/games', {
    json: {
      title,
      game_type: 'chat',
    },
  });

  expect(createResponse.status).toBe(201);
  expect(createResponse.body.data.game.title).toBe(title);
  const gameId = createResponse.body.data.game.id;

  const ownerListResponse = await owner.client.get('/api/games');
  expect(ownerListResponse.status).toBe(200);
  expect(ownerListResponse.body.data.games).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: gameId,
        title,
        status: 'open',
        player_count: 1,
        owner_username: owner.credentials.username,
      }),
    ])
  );

  const joinResponse = await player.client.post(`/api/games/${gameId}/join`);
  expect(joinResponse.status).toBe(200);
  expect(joinResponse.body.data).toEqual({
    joined: true,
    game_id: gameId,
    role: 'player',
  });

  const playerListResponse = await player.client.get('/api/games');
  expect(playerListResponse.status).toBe(200);
  expect(playerListResponse.body.data.games).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: gameId,
        member_count: 2,
        player_count: 2,
        is_member: true,
        member_role: 'player',
      }),
    ])
  );

  const startResponse = await owner.client.post(`/api/games/${gameId}/start`);
  expect(startResponse.status).toBe(200);
  expect(startResponse.body.data).toEqual({
    started: true,
    game_id: gameId,
  });

  const refreshedOwnerListResponse = await owner.client.get('/api/games');
  expect(refreshedOwnerListResponse.status).toBe(200);
  expect(refreshedOwnerListResponse.body.data.games).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: gameId,
        status: 'in_progress',
        player_count: 2,
      }),
    ])
  );
});

test('non-owners cannot start a game', async () => {
  const baseURL = getServerInfo().baseURL;
  const owner = await registerAndSignIn(baseURL, 'start-owner');
  const player = await registerAndSignIn(baseURL, 'start-player');

  const createResponse = await owner.client.post('/api/games', {
    json: {
      title: `permission-game-${Date.now().toString(36)}`,
      game_type: 'chat',
    },
  });
  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;

  const joinResponse = await player.client.post(`/api/games/${gameId}/join`);
  expect(joinResponse.status).toBe(200);

  const startResponse = await player.client.post(`/api/games/${gameId}/start`);
  expect(startResponse.status).toBe(403);
  expect(startResponse.body.error).toBe('Only the game owner or an admin can start the game.');
});

test('unauthenticated users cannot create games', async () => {
  const client = createApiClient(getServerInfo().baseURL);
  const response = await client.post('/api/games', {
    json: {
      title: 'unauthorized-game',
      game_type: 'chat',
    },
  });

  expect(response.status).toBe(401);
  expect(response.body.error).toBe('Unauthorized.');
});
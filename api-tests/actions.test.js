const { registerAndSignIn } = require('./support/auth');
const { getServerInfo } = require('./support/server-runtime');

test('members can create and list actions once a chat game has started', async () => {
  const baseURL = getServerInfo().baseURL;
  const owner = await registerAndSignIn(baseURL, 'actions-owner');
  const player = await registerAndSignIn(baseURL, 'actions-player');
  const observer = await registerAndSignIn(baseURL, 'actions-observer');

  const createResponse = await owner.client.post('/api/games', {
    json: {
      title: `actions-game-${Date.now().toString(36)}`,
      game_type: 'chat',
    },
  });
  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;

  expect((await player.client.post(`/api/games/${gameId}/join`)).status).toBe(200);
  expect((await observer.client.post(`/api/games/${gameId}/observe`)).status).toBe(200);
  expect((await owner.client.post(`/api/games/${gameId}/start`)).status).toBe(200);

  const createActionResponse = await player.client.post(`/api/games/${gameId}/actions`, {
    json: {
      action_type: 'ready',
      payload: {
        source: 'api-test',
      },
    },
  });
  expect(createActionResponse.status).toBe(201);
  expect(createActionResponse.body.data).toEqual({ created: true });

  const listActionsResponse = await owner.client.get(`/api/games/${gameId}/actions?since_id=0`);
  expect(listActionsResponse.status).toBe(200);
  expect(listActionsResponse.body.data.actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action_type: 'ready',
        payload: {
          source: 'api-test',
        },
        user: expect.objectContaining({
          username: player.credentials.username,
        }),
      }),
    ])
  );
  const firstActionId = listActionsResponse.body.data.actions[0].id;
  expect(listActionsResponse.body.data.last_id).toBeGreaterThanOrEqual(firstActionId);

  const sinceResponse = await player.client.get(`/api/games/${gameId}/actions?since_id=${firstActionId}`);
  expect(sinceResponse.status).toBe(200);
  expect(sinceResponse.body.data.actions).toEqual([]);

  const observerCreateResponse = await observer.client.post(`/api/games/${gameId}/actions`, {
    json: {
      action_type: 'spectate',
      payload: {},
    },
  });
  expect(observerCreateResponse.status).toBe(403);
  expect(observerCreateResponse.body.error).toBe('Observers cannot submit actions.');
});
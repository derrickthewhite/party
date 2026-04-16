const { registerAndSignIn } = require('./support/auth');
const { getServerInfo } = require('./support/server-runtime');

test('members can post and fetch chat messages, and observers remain read-only', async () => {
  const baseURL = getServerInfo().baseURL;
  const owner = await registerAndSignIn(baseURL, 'messages-owner');
  const player = await registerAndSignIn(baseURL, 'messages-player');
  const observer = await registerAndSignIn(baseURL, 'messages-observer');

  const createResponse = await owner.client.post('/api/games', {
    json: {
      title: `messages-game-${Date.now().toString(36)}`,
      game_type: 'chat',
    },
  });
  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;

  expect((await player.client.post(`/api/games/${gameId}/join`)).status).toBe(200);
  expect((await observer.client.post(`/api/games/${gameId}/observe`)).status).toBe(200);

  const sendResponse = await player.client.post(`/api/games/${gameId}/messages`, {
    json: {
      body: 'hello from api tests',
    },
  });
  expect(sendResponse.status).toBe(201);
  expect(sendResponse.body.data.message.body).toBe('hello from api tests');
  const firstMessageId = sendResponse.body.data.message.id;

  const listResponse = await owner.client.get(`/api/games/${gameId}/messages?since_id=0`);
  expect(listResponse.status).toBe(200);
  expect(listResponse.body.data.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: firstMessageId,
        body: 'hello from api tests',
        user: expect.objectContaining({
          username: player.credentials.username,
        }),
      }),
    ])
  );
  expect(listResponse.body.data.member_role).toBe('owner');
  expect(listResponse.body.data.last_id).toBe(firstMessageId);

  const sinceResponse = await player.client.get(`/api/games/${gameId}/messages?since_id=${firstMessageId}`);
  expect(sinceResponse.status).toBe(200);
  expect(sinceResponse.body.data.messages).toEqual([]);
  expect(sinceResponse.body.data.last_id).toBe(firstMessageId);

  const observerReadResponse = await observer.client.get(`/api/games/${gameId}/messages?since_id=0`);
  expect(observerReadResponse.status).toBe(200);
  expect(observerReadResponse.body.data.member_role).toBe('observer');

  const observerSendResponse = await observer.client.post(`/api/games/${gameId}/messages`, {
    json: {
      body: 'observer should fail',
    },
  });
  expect(observerSendResponse.status).toBe(403);
  expect(observerSendResponse.body.error).toBe('Observers cannot send chat messages.');
});
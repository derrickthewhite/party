const { createApiClient } = require('./support/api-client');
const { buildCredentials, registerAndSignIn, signIn, signUp } = require('./support/auth');
const { setUserAdmin } = require('./support/admin');
const { getServerInfo } = require('./support/server-runtime');

async function createAdmin() {
  const { baseURL } = getServerInfo();
  const admin = await registerAndSignIn(baseURL, 'room-admin');
  setUserAdmin(admin.credentials.username, true);
  return admin;
}

test('signup with a valid room code joins that room', async () => {
  const { baseURL } = getServerInfo();
  const { client } = await registerAndSignIn(baseURL, 'room-member');
  const me = await client.get('/api/auth/me');
  expect(me.status).toBe(200);
  expect(me.body.data.user.rooms).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'Main',
        code: 'local',
      }),
    ])
  );
});

test('signup with a bad room code is rejected', async () => {
  const client = createApiClient(getServerInfo().baseURL);
  const credentials = buildCredentials('bad-invite');
  const response = await signUp(client, credentials, 'not-a-real-room');
  expect(response.status).toBe(403);
  expect(response.body.error).toBe('Invalid invite key.');
});

test('lobby list only includes games from rooms the user belongs to', async () => {
  const { baseURL } = getServerInfo();
  const admin = await createAdmin();
  const ownerA = await registerAndSignIn(baseURL, 'room-a');
  const code = `other-${Date.now().toString(36)}`;
  const roomResponse = await admin.client.post('/api/admin/rooms', {
    json: { name: 'Other', code },
  });
  expect(roomResponse.status).toBe(201);
  const otherRoomId = roomResponse.body.data.room.id;

  const ownerBClient = createApiClient(baseURL);
  const credentialsB = buildCredentials('room-b');
  expect((await signUp(ownerBClient, credentialsB, code)).status).toBe(201);
  expect((await signIn(ownerBClient, credentialsB)).status).toBe(200);

  const gameA = await ownerA.client.post('/api/games', {
    json: { title: `a-${Date.now()}`, game_type: 'chat' },
  });
  expect(gameA.status).toBe(201);
  const gameB = await ownerBClient.post('/api/games', {
    json: { title: `b-${Date.now()}`, game_type: 'chat', room_id: otherRoomId },
  });
  expect(gameB.status).toBe(201);

  const listA = await ownerA.client.get('/api/games');
  const listB = await ownerBClient.get('/api/games');
  const idsA = listA.body.data.games.map((game) => game.id);
  const idsB = listB.body.data.games.map((game) => game.id);
  expect(idsA).toContain(gameA.body.data.game.id);
  expect(idsA).not.toContain(gameB.body.data.game.id);
  expect(idsB).toContain(gameB.body.data.game.id);
  expect(idsB).not.toContain(gameA.body.data.game.id);
});

test('leaving a room hides its games in the lobby without kicking game membership', async () => {
  const { baseURL } = getServerInfo();
  const admin = await createAdmin();
  const owner = await registerAndSignIn(baseURL, 'keep-owner');
  const player = await registerAndSignIn(baseURL, 'keep-player');

  const createResponse = await owner.client.post('/api/games', {
    json: { title: `stay-${Date.now()}`, game_type: 'chat' },
  });
  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;
  expect((await player.client.post(`/api/games/${gameId}/join`)).status).toBe(200);

  const me = await player.client.get('/api/auth/me');
  const roomId = me.body.data.user.rooms[0].id;
  const remove = await admin.client.delete(`/api/admin/users/${me.body.data.user.id}/rooms/${roomId}`);
  expect(remove.status).toBe(200);

  const list = await player.client.get('/api/games');
  const ids = list.body.data.games.map((game) => game.id);
  expect(ids).not.toContain(gameId);

  const detail = await player.client.get(`/api/games/${gameId}`);
  expect(detail.status).toBe(200);
  expect(detail.body.data.game.id).toBe(gameId);
});

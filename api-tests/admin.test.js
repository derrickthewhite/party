const { createApiClient } = require('./support/api-client');
const { registerAndSignIn } = require('./support/auth');
const { setUserAdmin } = require('./support/admin');
const { getServerInfo } = require('./support/server-runtime');

async function createAdmin() {
  const { baseURL } = getServerInfo();
  const admin = await registerAndSignIn(baseURL, 'adm');
  setUserAdmin(admin.credentials.username, true);
  return admin;
}

test('non-admins cannot use admin routes', async () => {
  const { baseURL } = getServerInfo();
  const user = await registerAndSignIn(baseURL, 'not-admin');
  const response = await user.client.get('/api/admin/users');
  expect(response.status).toBe(403);
});

test('admin can create a room, add members, and manage admin flags', async () => {
  const { baseURL } = getServerInfo();
  const admin = await createAdmin();
  const other = await registerAndSignIn(baseURL, 'to-promote');

  const usersResponse = await admin.client.get('/api/admin/users');
  expect(usersResponse.status).toBe(200);
  expect(usersResponse.body.data.users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ username: other.credentials.username }),
    ])
  );

  const code = `room-${Date.now().toString(36)}`;
  const createRoom = await admin.client.post('/api/admin/rooms', {
    json: { name: 'Extra', code },
  });
  expect(createRoom.status).toBe(201);
  const roomId = createRoom.body.data.room.id;

  const otherMe = await other.client.get('/api/auth/me');
  const otherId = otherMe.body.data.user.id;
  const addMembers = await admin.client.post(`/api/admin/rooms/${roomId}/members`, {
    json: { user_ids: [otherId] },
  });
  expect(addMembers.status).toBe(200);

  const afterAdd = await other.client.get('/api/auth/me');
  expect(afterAdd.body.data.user.rooms.map((room) => room.id)).toContain(roomId);

  const grant = await admin.client.post(`/api/admin/users/${otherId}/admin`, {
    json: { is_admin: 1 },
  });
  expect(grant.status).toBe(200);

  const revoke = await admin.client.post(`/api/admin/users/${otherId}/admin`, {
    json: { is_admin: 0 },
  });
  expect(revoke.status).toBe(200);

  const adminMe = await admin.client.get('/api/auth/me');
  const selfDemote = await admin.client.post(`/api/admin/users/${adminMe.body.data.user.id}/admin`, {
    json: { is_admin: 0 },
  });
  expect(selfDemote.status).toBe(403);
});

test('admin lists include game counts and can delete empty users and rooms', async () => {
  const { baseURL } = getServerInfo();
  const admin = await createAdmin();
  const emptyUser = await registerAndSignIn(baseURL, 'empty-user');
  const emptyMe = await emptyUser.client.get('/api/auth/me');
  const emptyUserId = emptyMe.body.data.user.id;

  const usersResponse = await admin.client.get('/api/admin/users');
  const listedEmpty = usersResponse.body.data.users.find((user) => user.id === emptyUserId);
  expect(listedEmpty.game_count).toBe(0);

  const roomsResponse = await admin.client.get('/api/admin/rooms');
  expect(roomsResponse.body.data.rooms).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'local',
        game_count: expect.any(Number),
      }),
    ])
  );

  const createRoom = await admin.client.post('/api/admin/rooms', {
    json: { name: 'Disposable', code: `gone-${Date.now().toString(36)}` },
  });
  expect(createRoom.status).toBe(201);
  const roomId = createRoom.body.data.room.id;

  const listedRoom = (await admin.client.get('/api/admin/rooms')).body.data.rooms.find((room) => room.id === roomId);
  expect(listedRoom.game_count).toBe(0);

  const renamedCode = `renamed-${Date.now().toString(36)}`;
  const updateRoom = await admin.client.post(`/api/admin/rooms/${roomId}`, {
    json: { name: 'Renamed', code: renamedCode },
  });
  expect(updateRoom.status).toBe(200);
  expect(updateRoom.body.data.room).toEqual(expect.objectContaining({
    id: roomId,
    name: 'Renamed',
    code: renamedCode,
  }));

  const deleteRoom = await admin.client.delete(`/api/admin/rooms/${roomId}`);
  expect(deleteRoom.status).toBe(200);

  const deleteUser = await admin.client.delete(`/api/admin/users/${emptyUserId}`);
  expect(deleteUser.status).toBe(200);

  const occupied = await registerAndSignIn(baseURL, 'has-game');
  const createGame = await occupied.client.post('/api/games', {
    json: { title: `keep-${Date.now()}`, game_type: 'chat' },
  });
  expect(createGame.status).toBe(201);
  const occupiedMe = await occupied.client.get('/api/auth/me');
  const occupiedDelete = await admin.client.delete(`/api/admin/users/${occupiedMe.body.data.user.id}`);
  expect(occupiedDelete.status).toBe(409);

  const selfDelete = await admin.client.delete(`/api/admin/users/${(await admin.client.get('/api/auth/me')).body.data.user.id}`);
  expect(selfDelete.status).toBe(403);
});

test('unauthenticated admin routes return 401', async () => {
  const client = createApiClient(getServerInfo().baseURL);
  const response = await client.get('/api/admin/rooms');
  expect(response.status).toBe(401);
});

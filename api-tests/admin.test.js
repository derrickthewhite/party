const fs = require('fs');
const path = require('path');
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

test('admin can manage player icon tags, names, hide, and upload', async () => {
  const { baseURL } = getServerInfo();
  const admin = await createAdmin();

  const listResponse = await admin.client.get('/api/admin/player-icons');
  expect(listResponse.status).toBe(200);
  const icons = listResponse.body.data.icons;
  const tags = listResponse.body.data.tags;
  expect(icons.length).toBeGreaterThan(300);
  expect(tags.map((tag) => tag.name)).toEqual(expect.arrayContaining([
    'Humans',
    'Animals',
    'Classic',
    'Psi Wars',
  ]));

  const target = icons.find((icon) => icon.key === 'AmberHardHat.svg') || icons[0];
  const rename = await admin.client.post('/api/admin/player-icons/icon', {
    json: {
      icon_key: target.key,
      display_name: 'Hard Hat Captain',
      hidden: target.hidden ? 1 : 0,
      auto_assign: target.auto_assign ? 1 : 0,
      tag_ids: (target.tags || []).map((tag) => tag.id),
    },
  });
  expect(rename.status).toBe(200);
  const renamed = rename.body.data.icons.find((icon) => icon.key === target.key);
  expect(renamed.label).toBe('Hard Hat Captain');
  expect(renamed.filename).toBe(target.key);

  const createTag = await admin.client.post('/api/admin/player-icons/tags', {
    json: { name: 'Test Pack' },
  });
  expect(createTag.status).toBe(200);
  const createdTag = createTag.body.data.tags.find((tag) => tag.name === 'Test Pack');
  expect(createdTag).toEqual(expect.objectContaining({ name: 'Test Pack' }));

  const assign = await admin.client.post('/api/admin/player-icons/bulk', {
    json: {
      icon_keys: [target.key],
      add_tag_id: createdTag.id,
    },
  });
  expect(assign.status).toBe(200);
  const assigned = assign.body.data.icons.find((icon) => icon.key === target.key);
  expect(assigned.tags.map((tag) => tag.name)).toContain('Test Pack');

  const hide = await admin.client.post('/api/admin/player-icons/icon', {
    json: {
      icon_key: target.key,
      hidden: 1,
    },
  });
  expect(hide.status).toBe(200);

  const game = await admin.client.post('/api/games', {
    json: { title: `icon-catalog-${Date.now().toString(36)}`, game_type: 'chat' },
  });
  expect(game.status).toBe(201);
  const detailResponse = await admin.client.get(`/api/games/${game.body.data.game.id}`);
  expect(detailResponse.status).toBe(200);
  const catalog = detailResponse.body.data.game.icon_catalog;
  expect(catalog[0]).toEqual(expect.objectContaining({
    key: expect.any(String),
    label: expect.any(String),
    tags: expect.any(Array),
  }));
  expect(catalog.some((entry) => entry.key === target.key)).toBe(false);

  const uploadName = `UploadTestHead-${Date.now().toString(36)}.svg`;
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>');
  const formData = new FormData();
  formData.append('file', new File([svg], uploadName, { type: 'image/svg+xml' }));
  const upload = await admin.client.post('/api/admin/player-icons/upload', { formData });
  expect(upload.status).toBe(201);
  expect(upload.body.data.icon_key).toBe(uploadName);
  expect(upload.body.data.icons.some((icon) => icon.key === uploadName)).toBe(true);

  const deleteTag = await admin.client.delete(`/api/admin/player-icons/tags/${createdTag.id}`);
  expect(deleteTag.status).toBe(200);
  expect(deleteTag.body.data.tags.some((tag) => tag.name === 'Test Pack')).toBe(false);

  await admin.client.post('/api/admin/player-icons/icon', {
    json: {
      icon_key: target.key,
      display_name: target.label,
      hidden: target.hidden ? 1 : 0,
      auto_assign: target.auto_assign ? 1 : 0,
      tag_ids: (target.tags || []).map((tag) => tag.id),
    },
  });

  const uploadedPath = path.join(getServerInfo().rootDir, 'assets', 'PlayerIcons', uploadName);
  if (fs.existsSync(uploadedPath)) {
    fs.unlinkSync(uploadedPath);
  }
});

test('hidden player icons stay on members who already have them', async () => {
  const { baseURL } = getServerInfo();
  const admin = await createAdmin();
  const createResponse = await admin.client.post('/api/games', {
    json: { title: `keep-hidden-icon-${Date.now().toString(36)}`, game_type: 'chat' },
  });
  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;
  const createdDetail = await admin.client.get(`/api/games/${gameId}`);
  expect(createdDetail.status).toBe(200);
  const member = createdDetail.body.data.game.members[0];
  expect(member.icon_key).toEqual(expect.any(String));

  const hide = await admin.client.post('/api/admin/player-icons/icon', {
    json: {
      icon_key: member.icon_key,
      hidden: 1,
    },
  });
  expect(hide.status).toBe(200);

  const detail = await admin.client.get(`/api/games/${gameId}`);
  expect(detail.status).toBe(200);
  const refreshed = detail.body.data.game.members.find((entry) => entry.username === admin.credentials.username);
  expect(refreshed.icon_key).toBe(member.icon_key);
  expect(detail.body.data.game.icon_catalog.some((entry) => entry.key === member.icon_key)).toBe(false);

  await admin.client.post('/api/admin/player-icons/icon', {
    json: {
      icon_key: member.icon_key,
      hidden: 0,
    },
  });
});

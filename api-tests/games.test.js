const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createApiClient } = require('./support/api-client');
const { registerAndSignIn } = require('./support/auth');
const { getServerInfo } = require('./support/server-runtime');

function resolvePhpBin(rootDir) {
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  if (process.env.PARTY_PHP_BIN) {
    return process.env.PARTY_PHP_BIN;
  }

  return fs.existsSync(bundledPhp) ? bundledPhp : 'php';
}

function runPhpInline(script, args = []) {
  const { rootDir } = getServerInfo();
  const phpBin = resolvePhpBin(rootDir);
  const result = spawnSync(phpBin, ['-r', script, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(stderr || `PHP exited with ${result.status}`);
  }

  return String(result.stdout || '');
}

function readDefaultIconAssignmentMilestones(gameId) {
  const output = runPhpInline([
    'require "api/lib/game_icons.php";',
    '$gameId = (int)$argv[1];',
    '$catalog = game_default_icon_catalog_for_game($gameId);',
    '$human = array_values(game_explicit_human_icon_catalog());',
    '$animal = array_values(game_explicit_animal_icon_catalog());',
    '$payload = [',
    '  "firstHumanIndex" => array_search($human[0], $catalog, true),',
    '  "firstHumanKey" => $human[0],',
    '  "firstAnimalIndex" => array_search($animal[0], $catalog, true),',
    '  "firstAnimalKey" => $animal[0],',
    '];',
    'echo json_encode($payload);',
  ].join(' '), [String(gameId)]);

  return JSON.parse(output.trim());
}

function seedGamePlayersWithNoIcons(gameId, count) {
  const { sqlitePath } = getServerInfo();
  const seedPrefix = `default-icon-${gameId}-${Date.now().toString(36)}`;
  runPhpInline([
    '$db = new PDO("sqlite:" . $argv[1]);',
    '$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);',
    '$gameId = (int)$argv[2];',
    '$count = (int)$argv[3];',
    '$prefix = $argv[4];',
    '$userStmt = $db->prepare("INSERT INTO users (username, srp_salt, srp_verifier, is_active, is_admin) VALUES (:username, :srp_salt, :srp_verifier, 1, 0)");',
    '$memberStmt = $db->prepare("INSERT INTO game_members (game_id, user_id, role, icon_key) VALUES (:game_id, :user_id, :role, NULL)");',
    '$db->beginTransaction();',
    'for ($i = 0; $i < $count; $i += 1) {',
    '  $username = strtolower($prefix . "-" . $i);',
    '  $userStmt->execute([":username" => $username, ":srp_salt" => str_repeat("a", 64), ":srp_verifier" => str_repeat("b", 64)]);',
    '  $memberStmt->execute([":game_id" => $gameId, ":user_id" => (int)$db->lastInsertId(), ":role" => "player"]);',
    '}',
    '$db->commit();',
  ].join(' '), [sqlitePath, String(gameId), String(count), seedPrefix]);
}

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

test('default icon assignment can reach human and animal icons', async () => {
  const baseURL = getServerInfo().baseURL;
  const owner = await registerAndSignIn(baseURL, 'default-icon-owner');
  const title = `default-icons-${Date.now().toString(36)}`;

  const createResponse = await owner.client.post('/api/games', {
    json: {
      title,
      game_type: 'chat',
    },
  });

  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;
  const milestones = readDefaultIconAssignmentMilestones(gameId);
  const extraPlayersNeeded = Math.max(milestones.firstHumanIndex, milestones.firstAnimalIndex);
  seedGamePlayersWithNoIcons(gameId, extraPlayersNeeded);

  const detailResponse = await owner.client.get(`/api/games/${gameId}`);
  expect(detailResponse.status).toBe(200);

  const members = detailResponse.body.data.game.members;
  const memberIconKeys = members.map((member) => member.icon_key).filter(Boolean);

  expect(memberIconKeys).toContain(milestones.firstHumanKey);
  expect(memberIconKeys).toContain(milestones.firstAnimalKey);
});
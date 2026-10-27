const { registerAndSignIn } = require('./support/auth');
const { getServerInfo } = require('./support/server-runtime');

function uniqueName(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function session(label) {
  const { baseURL } = getServerInfo();
  return registerAndSignIn(baseURL, uniqueName(label));
}

function orderDoc(power, map, orders = []) {
  return {
    kind: 'diplomacy-orders',
    map,
    power,
    orders,
  };
}

function retreatDoc(power, map, orders = []) {
  return {
    kind: 'diplomacy-retreats',
    map,
    power,
    orders,
  };
}

function plantDislodgePosition(gameId) {
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');
  const { rootDir } = getServerInfo();
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  const phpBin = process.env.PARTY_PHP_BIN || (fs.existsSync(bundledPhp) ? bundledPhp : 'php');
  const script = [
    'require "api/lib/diplomacy.php";',
    '$gameId = (int)$argv[1];',
    '$loaded = diplomacy_load_map("EuropeDiploMap");',
    '$graph = $loaded["graph"];',
    '$position = $loaded["start"];',
    '$ids = [];',
    'foreach ($graph["provinces"] as $id => $province) {',
    '  $name = strtolower((string)($province["name"] ?? ""));',
    '  if ($name === "picardy" || $name === "burgundy" || $name === "belgium") {',
    '    $ids[$name] = $id;',
    '  }',
    '}',
    'foreach (["picardy", "burgundy", "belgium"] as $name) {',
    '  if (empty($ids[$name])) { fwrite(STDERR, "missing $name\\n"); exit(1); }',
    '}',
    '$position["units"] = [',
    '  ["province" => $ids["picardy"], "unit" => "army", "power" => "france"],',
    '  ["province" => $ids["burgundy"], "unit" => "army", "power" => "france"],',
    '  ["province" => $ids["belgium"], "unit" => "army", "power" => "germany"],',
    '];',
    'diplomacy_write_snapshot($gameId, 1901, "spring_orders", $position, null, null);',
    'db()->prepare("UPDATE game_state SET phase = :phase, current_round = 1901 WHERE game_id = :id")->execute(["phase" => "spring_orders", "id" => $gameId]);',
    'echo json_encode(["picardy" => $ids["picardy"], "burgundy" => $ids["burgundy"], "belgium" => $ids["belgium"], "map" => $position["map"]]);',
  ].join('');
  const result = spawnSync(phpBin, ['-r', script, String(gameId)], {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `php exited ${result.status}`).trim());
  }
  return JSON.parse(String(result.stdout || '').trim());
}

async function createDiplomacyGame(owner) {
  const response = await owner.client.post('/api/games', {
    json: { title: uniqueName('dip'), game_type: 'diplomacy' },
  });
  expect(response.status).toBe(201);
  return response.body.data.game;
}

async function detail(client, gameId) {
  const response = await client.get(`/api/games/${gameId}`);
  expect(response.status).toBe(200);
  return response.body.data.game;
}

async function submitOrders(client, gameId, power, map, orders = []) {
  const response = await client.post(`/api/games/${gameId}/actions/diplomacy-order`, {
    json: {
      action_type: 'order',
      payload: orderDoc(power, map, orders),
    },
  });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return response.body.data;
}

async function markReady(client, gameId) {
  const response = await client.post(`/api/games/${gameId}/actions/diplomacy-ready`, {
    json: { ready: true },
  });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return response.body.data;
}

test('owner can set the map and nation mode while the game is open', async () => {
  const owner = await session('dip-setup-owner');
  const game = await createDiplomacyGame(owner);

  const open = await detail(owner.client, game.id);
  expect(open.phase).toBe('setup');
  expect(open.diplomacy.map_key).toBe('EuropeDiploMap');
  expect(open.diplomacy.nation_mode).toBe('pick');
  expect(open.diplomacy.nation_count).toBe('single');
  expect(open.diplomacy.nation_quota).toBe(1);
  expect(open.diplomacy.powers.every((power) => power.availability === 'open')).toBe(true);
  expect(open.diplomacy.maps.length).toBeGreaterThan(0);

  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'random',
      diplomacy_nation_count: 'single',
    },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.data.game.diplomacy.nation_mode).toBe('random');
  expect(saved.body.data.game.diplomacy.nation_count).toBe('single');
});

test('conflicting nation picks are rejected and start assigns remaining powers', async () => {
  const owner = await session('dip-pick-owner');
  const player = await session('dip-pick-player');
  const extra = await session('dip-pick-extra');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  await extra.client.post(`/api/games/${game.id}/join`);

  const open = await detail(owner.client, game.id);
  const ownerId = memberId(open, owner);
  const playerId = memberId(open, player);

  const claimEngland = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'england', state: ownerId }] },
  });
  expect(claimEngland.status).toBe(200);
  expect(claimEngland.body.data.game.diplomacy.my_powers).toEqual(['england']);

  const conflict = await player.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'england', state: playerId }] },
  });
  expect(conflict.status).toBe(409);

  const claimFrance = await player.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'france', state: playerId }] },
  });
  expect(claimFrance.status).toBe(200);

  const civil = await player.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'france', state: 'civil' }] },
  });
  expect(civil.status).toBe(403);

  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);

  const ownerGame = await detail(owner.client, game.id);
  const playerGame = await detail(player.client, game.id);
  const extraGame = await detail(extra.client, game.id);
  expect(ownerGame.phase).toBe('spring_orders');
  expect(ownerGame.current_round).toBe(1901);
  expect(ownerGame.diplomacy.my_power).toBe('england');
  expect(playerGame.diplomacy.my_power).toBe('france');
  expect(extraGame.diplomacy.my_power).toBeTruthy();
  expect(extraGame.diplomacy.my_power).not.toBe('england');
  expect(extraGame.diplomacy.my_power).not.toBe('france');
});

test('orders stay hidden until resolve, then empty retreats and builds are skipped', async () => {
  const owner = await session('dip-secret-owner');
  const player = await session('dip-secret-player');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  await owner.client.post(`/api/games/${game.id}/start`);

  const ownerGame = await detail(owner.client, game.id);
  const playerGame = await detail(player.client, game.id);
  const map = ownerGame.diplomacy.position.map;
  const ownerPower = ownerGame.diplomacy.my_power;
  const playerPower = playerGame.diplomacy.my_power;

  await submitOrders(owner.client, game.id, ownerPower, map);
  const afterOne = await detail(player.client, game.id);
  expect(afterOne.phase).toBe('spring_orders');
  expect(afterOne.diplomacy.progress.submitted_count).toBe(1);
  expect(afterOne.diplomacy.progress.ready_count).toBe(0);
  expect(afterOne.diplomacy.my_orders).toBeNull();
  const ownerRow = afterOne.diplomacy.powers.find((power) => power.id === ownerPower);
  expect(ownerRow.orders_submitted).toBe(true);
  expect(ownerRow.ready).toBe(false);
  expect(ownerRow.center_count).toBeGreaterThan(0);
  const hiddenActions = await player.client.get(`/api/games/${game.id}/actions?since_id=0`);
  expect(hiddenActions.status).toBe(200);
  expect(hiddenActions.body.data.actions.filter((row) => row.action_type === 'order')).toEqual([]);

  await submitOrders(player.client, game.id, playerPower, map);
  const submittedOnly = await detail(owner.client, game.id);
  expect(submittedOnly.phase).toBe('spring_orders');

  await markReady(owner.client, game.id);
  await submitOrders(owner.client, game.id, ownerPower, map);
  const cleared = await detail(owner.client, game.id);
  expect(cleared.diplomacy.viewer_ready).toBe(false);
  expect(cleared.phase).toBe('spring_orders');

  await markReady(owner.client, game.id);
  await markReady(player.client, game.id);
  const afterSpring = await detail(owner.client, game.id);
  expect(afterSpring.phase).toBe('fall_orders');
  expect(afterSpring.current_round).toBe(1901);
  expect(afterSpring.diplomacy.history.some((item) => item.phase === 'spring_orders')).toBe(true);
  expect(afterSpring.diplomacy.my_orders).toBeNull();

  const ownerFall = await detail(owner.client, game.id);
  const playerFall = await detail(player.client, game.id);
  await submitOrders(owner.client, game.id, ownerFall.diplomacy.my_power, map);
  await submitOrders(player.client, game.id, playerFall.diplomacy.my_power, map);
  await markReady(owner.client, game.id);
  await markReady(player.client, game.id);
  const afterFall = await detail(owner.client, game.id);
  expect(afterFall.phase).toBe('spring_orders');
  expect(afterFall.current_round).toBe(1902);
});

test('a dislodge keeps spring retreats on the history timeline', async () => {
  const owner = await session('dip-retreat-history-owner');
  const game = await createDiplomacyGame(owner);
  const open = await detail(owner.client, game.id);
  const ownerId = memberId(open, owner);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'owner',
      diplomacy_nation_count: 'all',
    },
  });
  expect(saved.status).toBe(200);
  const assigned = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: {
      updates: [
        { power: 'france', state: ownerId },
        { power: 'germany', state: ownerId },
      ],
    },
  });
  expect(assigned.status).toBe(200);
  await owner.client.post(`/api/games/${game.id}/start`);

  const planted = plantDislodgePosition(game.id);
  const map = planted.map;
  await submitOrders(owner.client, game.id, 'france', map, [
    { province: planted.picardy, unit: 'army', action: 'move', to: planted.belgium },
    { province: planted.burgundy, unit: 'army', action: 'support-move', target: planted.picardy, to: planted.belgium },
  ]);
  await submitOrders(owner.client, game.id, 'germany', map);
  await markReady(owner.client, game.id);

  const retreatsLive = await detail(owner.client, game.id);
  expect(retreatsLive.phase).toBe('spring_retreats');
  const provinces = (retreatsLive.diplomacy.position.units || []).map((unit) => unit.province);
  expect(new Set(provinces).size).toBe(provinces.length);
  expect(provinces).toContain(planted.belgium);
  expect(retreatsLive.diplomacy.position.units.some((unit) => unit.power === 'germany')).toBe(false);
  expect(retreatsLive.diplomacy.retreats.some((entry) => entry.power === 'germany' && entry.province === planted.belgium)).toBe(true);
  expect(retreatsLive.diplomacy.history.some((item) => item.phase === 'spring_orders')).toBe(true);
  const liveRetreats = retreatsLive.diplomacy.history.find((item) => item.phase === 'spring_retreats');
  expect(liveRetreats).toBeTruthy();
  expect(liveRetreats.current).toBe(true);

  const liveSnap = await owner.client.get(`/api/games/${game.id}/diplomacy-snapshot?year=1901&phase=spring_retreats`);
  expect(liveSnap.status).toBe(200);
  expect(liveSnap.body.data.snapshot.mode).toBe('retreat');
  expect((liveSnap.body.data.snapshot.display_resolution.units || []).some((unit) => unit.dislodged)).toBe(true);

  const germanyRetreat = retreatsLive.diplomacy.retreats.find((entry) => entry.power === 'germany');
  const retreatResponse = await owner.client.post(`/api/games/${game.id}/actions/diplomacy-order`, {
    json: {
      action_type: 'retreat',
      payload: retreatDoc('germany', map, [{
        action: 'disband',
        province: germanyRetreat.province,
        unit: germanyRetreat.unit,
      }]),
    },
  });
  expect(retreatResponse.status).toBeGreaterThanOrEqual(200);
  expect(retreatResponse.status).toBeLessThan(300);
  await markReady(owner.client, game.id);

  const afterRetreats = await detail(owner.client, game.id);
  expect(afterRetreats.phase).toBe('fall_orders');
  const pastRetreats = afterRetreats.diplomacy.history.find((item) => item.phase === 'spring_retreats');
  expect(pastRetreats).toBeTruthy();
  expect(pastRetreats.current).toBeUndefined();
  expect(afterRetreats.diplomacy.history.some((item) => item.phase === 'spring_orders')).toBe(true);
  expect(afterRetreats.diplomacy.history.some((item) => item.phase === 'fall_orders' && item.current)).toBe(true);

  const pastSnap = await owner.client.get(`/api/games/${game.id}/diplomacy-snapshot?year=1901&phase=spring_retreats`);
  expect(pastSnap.status).toBe(200);
  expect(pastSnap.body.data.snapshot.mode).toBe('retreat');
  expect(pastSnap.body.data.snapshot.orders.kind).toBe('diplomacy-retreats');
  expect(pastSnap.body.data.snapshot.orders.orders).toEqual([
    { action: 'disband', province: germanyRetreat.province, unit: germanyRetreat.unit },
  ]);
  expect(pastSnap.body.data.snapshot.resolution).toBeTruthy();
  expect((pastSnap.body.data.snapshot.retreats || []).some((entry) => entry.power === 'germany')).toBe(true);
  expect((pastSnap.body.data.snapshot.display_resolution.units || []).some((unit) => unit.dislodged)).toBe(true);
});

test('owner can resolve early and too many players cannot start', async () => {
  const owner = await session('dip-early-owner');
  const player = await session('dip-early-player');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  await owner.client.post(`/api/games/${game.id}/start`);

  const ownerGame = await detail(owner.client, game.id);
  await submitOrders(owner.client, game.id, ownerGame.diplomacy.my_power, ownerGame.diplomacy.position.map);
  const early = await owner.client.post(`/api/games/${game.id}/actions/reveal`);
  expect(early.status).toBe(200);
  const after = await detail(owner.client, game.id);
  expect(after.phase).toBe('fall_orders');

  const crowded = await createDiplomacyGame(owner);
  const joiners = [];
  for (let i = 0; i < 7; i += 1) {
    joiners.push(session(`dip-crowd-${i}`));
  }
  const players = await Promise.all(joiners);
  for (const member of players) {
    const joined = await member.client.post(`/api/games/${crowded.id}/join`);
    expect(joined.status).toBe(200);
  }
  const start = await owner.client.post(`/api/games/${crowded.id}/start`);
  expect(start.status).toBe(200);
  const crowdedGame = await detail(owner.client, crowded.id);
  const seated = crowdedGame.diplomacy.powers.filter((power) => power.assigned_to);
  expect(seated).toHaveLength(7);
  expect(crowdedGame.diplomacy.powers.filter((power) => power.civil_disorder)).toHaveLength(0);
});

test('an 18-center majority after fall closes the game', async () => {
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');
  const owner = await session('dip-win-owner');
  const game = await createDiplomacyGame(owner);
  await owner.client.post(`/api/games/${game.id}/start`);

  const { rootDir } = getServerInfo();
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  const phpBin = process.env.PARTY_PHP_BIN || (fs.existsSync(bundledPhp) ? bundledPhp : 'php');
  const script = [
    'require "api/lib/diplomacy.php";',
    '$gameId = (int)$argv[1];',
    '$loaded = diplomacy_load_map("EuropeDiploMap");',
    '$graph = $loaded["graph"];',
    '$start = $loaded["start"];',
    '$centers = array_slice(diplomacy_supply_center_ids($graph), 0, 18);',
    '$ownership = $start["ownership"];',
    '$units = [];',
    'foreach ($centers as $id) { $ownership[$id] = "england"; $units[] = ["province" => $id, "unit" => "army", "power" => "england"]; }',
    '$position = $start;',
    '$position["ownership"] = $ownership;',
    '$position["units"] = $units;',
    'diplomacy_write_snapshot($gameId, 1901, "fall_orders", $position, null, null);',
    'db()->prepare("UPDATE game_state SET phase = :phase, current_round = 1901 WHERE game_id = :id")->execute(["phase" => "fall_orders", "id" => $gameId]);',
    'echo "ok";',
  ].join('');
  const result = spawnSync(phpBin, ['-r', script, String(game.id)], {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `php exited ${result.status}`).trim());
  }

  const reveal = await owner.client.post(`/api/games/${game.id}/actions/reveal`);
  expect(reveal.status).toBe(200);
  const closed = await detail(owner.client, game.id);
  expect(closed.status).toBe('closed');
  expect(String(closed.diplomacy.winner_summary || '')).toMatch(/England/i);
});

function memberId(game, sessionUser) {
  const username = sessionUser.credentials.username;
  const member = (game.members || []).find((row) => row.username === username);
  if (!member) {
    throw new Error(`Missing member ${username}`);
  }
  return member.id;
}

test('assign all lets one player take several nations and leaves the rest in civil disorder', async () => {
  const owner = await session('dip-all-owner');
  const player = await session('dip-all-player');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  const open = await detail(owner.client, game.id);
  const ownerId = memberId(open, owner);
  const playerId = memberId(open, player);

  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'owner',
      diplomacy_nation_count: 'all',
      diplomacy_timer_minutes: 30,
      diplomacy_timer_shortcut: false,
    },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.data.game.diplomacy.timer.minutes).toBeNull();
  expect(saved.body.data.game.diplomacy.timer.shortcut).toBe(false);
  const assigned = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: {
      updates: [
        { power: 'england', state: ownerId },
        { power: 'france', state: ownerId },
        { power: 'germany', state: playerId },
      ],
    },
  });
  expect(assigned.status).toBe(200);
  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);
  const ownerGame = await detail(owner.client, game.id);
  const playerGame = await detail(player.client, game.id);
  expect(ownerGame.diplomacy.my_powers.slice().sort()).toEqual(['england', 'france']);
  expect(playerGame.diplomacy.my_power).toBe('germany');
  const italy = ownerGame.diplomacy.powers.find((power) => power.id === 'italy');
  expect(italy.civil_disorder).toBe(true);
  expect(italy.assigned_to).toBeNull();
  expect(italy.color).toBeTruthy();
  const england = ownerGame.diplomacy.powers.find((power) => power.id === 'england');
  expect(england.assigned_to.username).toBe(owner.credentials.username);
  expect(england.center_count).toBeGreaterThan(0);
  expect(ownerGame.diplomacy.viewer_required).toBe(true);

  const map = ownerGame.diplomacy.position.map;
  await submitOrders(owner.client, game.id, 'england', map);
  const oneNation = await detail(player.client, game.id);
  expect(oneNation.diplomacy.powers.find((power) => power.id === 'england').orders_submitted).toBe(true);
  expect(oneNation.diplomacy.powers.find((power) => power.id === 'france').orders_submitted).toBe(false);
  expect(oneNation.diplomacy.progress.submitted_count).toBe(0);
  await submitOrders(owner.client, game.id, 'france', map);
  const bothNations = await detail(owner.client, game.id);
  expect(bothNations.diplomacy.my_orders_by_power.england.power).toBe('england');
  expect(bothNations.diplomacy.my_orders_by_power.france.power).toBe('france');
  expect(bothNations.diplomacy.progress.submitted_count).toBe(1);
  expect(bothNations.phase).toBe('spring_orders');
});

test('assign one each gives every player a single colored faction', async () => {
  const owner = await session('dip-one-owner');
  const player = await session('dip-one-player');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  const open = await detail(owner.client, game.id);
  const ownerId = memberId(open, owner);
  const playerId = memberId(open, player);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'pick',
      diplomacy_nation_count: 'single',
    },
  });
  expect(saved.status).toBe(200);

  const duplicate = await player.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: {
      updates: [
        { power: 'england', state: playerId },
        { power: 'france', state: playerId },
      ],
    },
  });
  expect(duplicate.status).toBe(409);

  const ownerClaim = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'england', state: ownerId }] },
  });
  expect(ownerClaim.status).toBe(200);
  const playerClaim = await player.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'france', state: playerId }] },
  });
  expect(playerClaim.status).toBe(200);
  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);
  const ownerGame = await detail(owner.client, game.id);
  const playerGame = await detail(player.client, game.id);
  expect(ownerGame.diplomacy.my_powers).toEqual(['england']);
  expect(playerGame.diplomacy.my_power).toBe('france');
  expect(ownerGame.diplomacy.powers.find((power) => power.id === 'germany').civil_disorder).toBe(true);
});

test('assign evenly pairs factions to players and can give one player two nations', async () => {
  const owner = await session('dip-even-owner');
  const player = await session('dip-even-player');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  const open = await detail(owner.client, game.id);
  const ownerId = memberId(open, owner);
  const playerId = memberId(open, player);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'pick',
      diplomacy_nation_count: 'even',
    },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.data.game.diplomacy.nation_quota).toBe(3);
  const assigned = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: {
      updates: [
        { power: 'england', state: ownerId },
        { power: 'france', state: ownerId },
        { power: 'germany', state: playerId },
        { power: 'italy', state: 'civil' },
      ],
    },
  });
  expect(assigned.status).toBe(200);
  expect(assigned.body.data.game.diplomacy.nation_quota).toBe(3);
  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);
  const ownerGame = await detail(owner.client, game.id);
  const playerGame = await detail(player.client, game.id);
  expect(ownerGame.diplomacy.my_powers).toHaveLength(3);
  expect(ownerGame.diplomacy.my_powers).toEqual(expect.arrayContaining(['england', 'france']));
  expect(playerGame.diplomacy.my_powers).toHaveLength(3);
  expect(playerGame.diplomacy.my_powers).toContain('germany');
  expect(ownerGame.diplomacy.powers.filter((power) => power.civil_disorder)).toHaveLength(1);
  expect(ownerGame.diplomacy.powers.find((power) => power.id === 'italy').civil_disorder).toBe(true);
});

test('assign all can start when there are more players than nations', async () => {
  const owner = await session('dip-extra-owner');
  const game = await createDiplomacyGame(owner);
  const players = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((index) => session(`dip-extra-${index}`)));
  for (const member of players) {
    const joined = await member.client.post(`/api/games/${game.id}/join`);
    expect(joined.status).toBe(200);
  }
  const open = await detail(owner.client, game.id);
  const ids = [owner, ...players].map((person) => memberId(open, person));
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'owner',
      diplomacy_nation_count: 'all',
    },
  });
  expect(saved.status).toBe(200);
  const assigned = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: {
      updates: open.diplomacy.powers.map((power, index) => ({
        power: power.id,
        state: ids[index],
      })),
    },
  });
  expect(assigned.status).toBe(200);
  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);
  const live = await detail(owner.client, game.id);
  const seated = live.diplomacy.powers
    .map((power) => (power.assigned_to ? power.assigned_to.user_id : null))
    .filter((id) => id !== null);
  expect(seated).not.toContain(ids[ids.length - 1]);
  expect(live.diplomacy.powers.every((power) => power.assigned_to)).toBe(true);
});

test('builds are offered per nation and history keeps a combined adjustment document', async () => {
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');
  const owner = await session('dip-build-owner');
  const game = await createDiplomacyGame(owner);
  const open = await detail(owner.client, game.id);
  const ownerId = memberId(open, owner);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'owner',
      diplomacy_nation_count: 'all',
    },
  });
  expect(saved.status).toBe(200);
  const assigned = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: {
      updates: [
        { power: 'england', state: ownerId },
        { power: 'france', state: ownerId },
      ],
    },
  });
  expect(assigned.status).toBe(200);
  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);

  const { rootDir } = getServerInfo();
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  const phpBin = process.env.PARTY_PHP_BIN || (fs.existsSync(bundledPhp) ? bundledPhp : 'php');
  const script = [
    'require "api/lib/diplomacy.php";',
    '$gameId = (int)$argv[1];',
    '$loaded = diplomacy_load_map("EuropeDiploMap");',
    '$graph = $loaded["graph"];',
    '$position = $loaded["start"];',
    '$homes = diplomacy_home_centers_from_start($graph, $position);',
    '$removed = false;',
    '$units = [];',
    'foreach ($position["units"] as $unit) {',
    '  if (!$removed && ($unit["power"] ?? "") === "england" && in_array($unit["province"], $homes["england"] ?? [], true)) {',
    '    $removed = true;',
    '    continue;',
    '  }',
    '  $units[] = $unit;',
    '}',
    'if (!$removed) { fwrite(STDERR, "england has no home unit\\n"); exit(1); }',
    '$position["units"] = array_values($units);',
    'diplomacy_write_snapshot($gameId, 1901, "builds", $position, null, null);',
    'db()->prepare("UPDATE game_state SET phase = :phase, current_round = 1901 WHERE game_id = :id")->execute(["phase" => "builds", "id" => $gameId]);',
    'echo "ok";',
  ].join('');
  const result = spawnSync(phpBin, ['-r', script, String(game.id)], {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `php exited ${result.status}`).trim());
  }

  const live = await detail(owner.client, game.id);
  expect(live.phase).toBe('builds');
  expect(live.diplomacy.mode).toBe('build');
  expect(live.diplomacy.map.key).toBe('EuropeDiploMap');
  expect(live.diplomacy.map.graph_url).toContain('EuropeDiploMap.graph.json');
  expect(live.diplomacy.my_powers.slice().sort()).toEqual(['england', 'france']);
  const englandAdj = live.diplomacy.adjustments.find((entry) => entry.power === 'england');
  expect(englandAdj).toBeTruthy();
  expect(englandAdj.builds.length).toBeGreaterThan(0);
  expect(live.diplomacy.adjustments.some((entry) => entry.power === 'france')).toBe(false);
  const offer = englandAdj.builds[0];
  const map = live.diplomacy.position.map;

  const rejected = await owner.client.post(`/api/games/${game.id}/actions/diplomacy-order`, {
    json: {
      action_type: 'adjust',
      payload: {
        kind: 'diplomacy-adjustments',
        map,
        power: 'france',
        orders: [],
      },
    },
  });
  expect(rejected.status).toBe(422);

  const accepted = await owner.client.post(`/api/games/${game.id}/actions/diplomacy-order`, {
    json: {
      action_type: 'adjust',
      payload: {
        kind: 'diplomacy-adjustments',
        map,
        power: 'england',
        orders: [{ action: 'build', province: offer.province, unit: offer.unit }],
      },
    },
  });
  expect(accepted.status).toBe(201);
  await markReady(owner.client, game.id);
  const advanced = await detail(owner.client, game.id);
  expect(advanced.phase).toBe('spring_orders');
  expect(advanced.current_round).toBe(1902);

  const snap = await owner.client.get('/api/games/' + game.id + '/diplomacy-snapshot?year=1901&phase=builds');
  expect(snap.status).toBe(200);
  expect(snap.body.data.snapshot.mode).toBe('build');
  expect(snap.body.data.snapshot.orders.kind).toBe('diplomacy-adjustments');
  expect(snap.body.data.snapshot.orders.power).toBe('');
  expect(snap.body.data.snapshot.orders.orders).toEqual([
    { action: 'build', province: offer.province, unit: offer.unit },
  ]);
  expect(snap.body.data.snapshot.resolution.adjustments.some((entry) => entry.power === 'england')).toBe(true);
});

test('a phase timer shortcuts only when that option is on', async () => {
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');
  const owner = await session('dip-timer-owner');
  const game = await createDiplomacyGame(owner);
  const off = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'random',
      diplomacy_nation_count: 'single',
      diplomacy_timer_minutes: 30,
      diplomacy_timer_shortcut: false,
    },
  });
  expect(off.status).toBe(200);
  expect(off.body.data.game.diplomacy.timer.minutes).toBeNull();
  expect(off.body.data.game.diplomacy.timer.shortcut).toBe(false);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'random',
      diplomacy_nation_count: 'single',
      diplomacy_timer_minutes: 30,
      diplomacy_timer_shortcut: true,
    },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.data.game.diplomacy.timer.minutes).toBe(30);
  expect(saved.body.data.game.diplomacy.timer.shortcut).toBe(true);
  await owner.client.post(`/api/games/${game.id}/start`);

  const { rootDir } = getServerInfo();
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  const phpBin = process.env.PARTY_PHP_BIN || (fs.existsSync(bundledPhp) ? bundledPhp : 'php');
  function runPhp(script) {
    const result = spawnSync(phpBin, ['-r', script, String(game.id)], {
      cwd: rootDir,
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `php exited ${result.status}`).trim());
    }
  }
  runPhp([
    'require "api/lib/diplomacy.php";',
    '$gameId = (int)$argv[1];',
    'db()->prepare("UPDATE games SET diplomacy_phase_deadline = datetime(\'now\', \'-1 minute\'), diplomacy_timer_shortcut = 0 WHERE id = :id")->execute(["id" => $gameId]);',
    'echo "ok";',
  ].join(''));
  const waiting = await detail(owner.client, game.id);
  expect(waiting.phase).toBe('spring_orders');
  expect(waiting.diplomacy.timer.remaining_seconds).toBe(0);

  runPhp([
    'require "api/lib/diplomacy.php";',
    '$gameId = (int)$argv[1];',
    'db()->prepare("UPDATE games SET diplomacy_timer_shortcut = 1 WHERE id = :id")->execute(["id" => $gameId]);',
    'echo "ok";',
  ].join(''));
  const advanced = await detail(owner.client, game.id);
  expect(advanced.phase).toBe('fall_orders');
  expect(advanced.diplomacy.timer.shortcut).toBe(true);
  expect(advanced.diplomacy.timer.remaining_seconds).toBeGreaterThan(0);
});

test('the owner can pause a phase timer so an overdue deadline does not advance', async () => {
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');
  const owner = await session('dip-pause-owner');
  const player = await session('dip-pause-player');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'random',
      diplomacy_nation_count: 'single',
      diplomacy_timer_minutes: 30,
      diplomacy_timer_shortcut: true,
    },
  });
  expect(saved.status).toBe(200);
  await owner.client.post(`/api/games/${game.id}/start`);

  const forbidden = await player.client.post(`/api/games/${game.id}/diplomacy-timer-pause`, {
    json: { paused: true },
  });
  expect(forbidden.status).toBe(403);

  const paused = await owner.client.post(`/api/games/${game.id}/diplomacy-timer-pause`, {
    json: { paused: true },
  });
  expect(paused.status).toBe(200);
  expect(paused.body.data.game.diplomacy.timer.paused).toBe(true);
  expect(paused.body.data.game.diplomacy.timer.deadline).toBeNull();
  expect(paused.body.data.game.diplomacy.timer.remaining_seconds).toBeGreaterThan(0);
  const held = paused.body.data.game.diplomacy.timer.remaining_seconds;
  const phaseWhilePaused = paused.body.data.game.phase;

  const { rootDir } = getServerInfo();
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  const phpBin = process.env.PARTY_PHP_BIN || (fs.existsSync(bundledPhp) ? bundledPhp : 'php');
  const forced = spawnSync(phpBin, ['-r', [
    'require "api/lib/diplomacy.php";',
    '$gameId = (int)$argv[1];',
    'diplomacy_apply_due_timer($gameId);',
    'echo "ok";',
  ].join(''), String(game.id)], {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });
  if (forced.status !== 0) {
    throw new Error((forced.stderr || forced.stdout || `php exited ${forced.status}`).trim());
  }
  const stillPaused = await detail(owner.client, game.id);
  expect(stillPaused.phase).toBe(phaseWhilePaused);
  expect(stillPaused.diplomacy.timer.paused).toBe(true);
  expect(stillPaused.diplomacy.timer.remaining_seconds).toBe(held);

  const resumed = await owner.client.post(`/api/games/${game.id}/diplomacy-timer-pause`, {
    json: { paused: false },
  });
  expect(resumed.status).toBe(200);
  expect(resumed.body.data.game.diplomacy.timer.paused).toBe(false);
  expect(resumed.body.data.game.diplomacy.timer.deadline).toBeTruthy();
  expect(resumed.body.data.game.diplomacy.timer.remaining_seconds).toBeGreaterThan(0);
  expect(resumed.body.data.game.phase).toBe(phaseWhilePaused);
});

test('random assign-all deals open nations and reset clears every claim', async () => {
  const owner = await session('dip-deal-owner');
  const player = await session('dip-deal-player');
  const extra = await session('dip-deal-extra');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  await extra.client.post(`/api/games/${game.id}/join`);
  const open = await detail(owner.client, game.id);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'random',
      diplomacy_nation_count: 'all',
    },
  });
  expect(saved.status).toBe(200);
  const marked = await owner.client.post(`/api/games/${game.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'turkey', state: 'civil' }] },
  });
  expect(marked.status).toBe(200);
  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);
  const live = await detail(owner.client, game.id);
  const turkey = live.diplomacy.powers.find((power) => power.id === 'turkey');
  expect(turkey.civil_disorder).toBe(true);
  const counts = {};
  live.diplomacy.powers.forEach((power) => {
    if (!power.assigned_to) {
      return;
    }
    counts[power.assigned_to.user_id] = (counts[power.assigned_to.user_id] || 0) + 1;
  });
  const values = Object.values(counts).sort((a, b) => a - b);
  expect(values).toHaveLength(3);
  expect(values[values.length - 1] - values[0]).toBeLessThanOrEqual(1);
  expect(values.reduce((sum, count) => sum + count, 0)).toBe(open.diplomacy.powers.length - 1);

  const fresh = await createDiplomacyGame(owner);
  const freshDetail = await detail(owner.client, fresh.id);
  const ownerId = memberId(freshDetail, owner);
  await owner.client.post(`/api/games/${fresh.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'pick',
      diplomacy_nation_count: 'all',
    },
  });
  await owner.client.post(`/api/games/${fresh.id}/diplomacy-assignment`, {
    json: { updates: [{ power: 'england', state: ownerId }, { power: 'france', state: 'civil' }] },
  });
  const reset = await owner.client.post(`/api/games/${fresh.id}/diplomacy-assignment`, {
    json: {
      updates: freshDetail.diplomacy.powers.map((power) => ({ power: power.id, state: 'open' })),
    },
  });
  expect(reset.status).toBe(200);
  expect(reset.body.data.game.diplomacy.powers.every((power) => power.availability === 'open')).toBe(true);
});

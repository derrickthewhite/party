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
  expect(open.diplomacy.maps.length).toBeGreaterThan(0);

  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'random',
    },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.data.game.diplomacy.nation_mode).toBe('random');
});

test('conflicting nation picks are rejected and start assigns remaining powers', async () => {
  const owner = await session('dip-pick-owner');
  const player = await session('dip-pick-player');
  const extra = await session('dip-pick-extra');
  const game = await createDiplomacyGame(owner);
  await player.client.post(`/api/games/${game.id}/join`);
  await extra.client.post(`/api/games/${game.id}/join`);

  const claimEngland = await owner.client.post(`/api/games/${game.id}/diplomacy-power`, {
    json: { power: 'england' },
  });
  expect(claimEngland.status).toBe(200);
  expect(claimEngland.body.data.game.diplomacy.my_chosen_power).toBe('england');

  const conflict = await player.client.post(`/api/games/${game.id}/diplomacy-power`, {
    json: { power: 'england' },
  });
  expect(conflict.status).toBe(409);

  const claimFrance = await player.client.post(`/api/games/${game.id}/diplomacy-power`, {
    json: { power: 'france' },
  });
  expect(claimFrance.status).toBe(200);

  const randomPick = await extra.client.post(`/api/games/${game.id}/diplomacy-power`, {
    json: { power: 'random' },
  });
  expect(randomPick.status).toBe(200);

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
  expect(start.status).toBe(409);
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
  const assignments = {};
  open.diplomacy.powers.forEach((power) => {
    assignments[power.id] = null;
  });
  assignments.england = ownerId;
  assignments.france = ownerId;
  assignments.germany = playerId;

  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'assign_all',
      diplomacy_assignments: assignments,
      diplomacy_timer_minutes: null,
      diplomacy_timer_shortcut: false,
    },
  });
  expect(saved.status).toBe(200);
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
  const assignments = {};
  open.diplomacy.powers.forEach((power) => {
    assignments[power.id] = null;
  });
  assignments.england = memberId(open, owner);
  assignments.france = memberId(open, owner);

  const duplicate = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'one_each',
      diplomacy_assignments: assignments,
    },
  });
  expect(duplicate.status).toBe(422);

  assignments.france = memberId(open, player);
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'one_each',
      diplomacy_assignments: assignments,
    },
  });
  expect(saved.status).toBe(200);
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
  const assignments = {
    england: memberId(open, owner),
    france: memberId(open, owner),
    germany: memberId(open, player),
  };
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'even',
      diplomacy_assignments: assignments,
    },
  });
  expect(saved.status).toBe(200);
  const started = await owner.client.post(`/api/games/${game.id}/start`);
  expect(started.status).toBe(200);
  const ownerGame = await detail(owner.client, game.id);
  expect(ownerGame.diplomacy.my_powers.slice().sort()).toEqual(['england', 'france']);
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
  const assignments = {};
  open.diplomacy.powers.forEach((power, index) => {
    assignments[power.id] = ids[index];
  });
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'assign_all',
      diplomacy_assignments: assignments,
    },
  });
  expect(saved.status).toBe(200);
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
  const assignments = {};
  open.diplomacy.powers.forEach((power) => {
    assignments[power.id] = null;
  });
  assignments.england = ownerId;
  assignments.france = ownerId;
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'assign_all',
      diplomacy_assignments: assignments,
    },
  });
  expect(saved.status).toBe(200);
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
  const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
    json: {
      diplomacy_map_key: 'EuropeDiploMap',
      diplomacy_nation_mode: 'random',
      diplomacy_timer_minutes: 30,
      diplomacy_timer_shortcut: false,
    },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.data.game.diplomacy.timer.minutes).toBe(30);
  expect(saved.body.data.game.diplomacy.timer.shortcut).toBe(false);
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
    'db()->prepare("UPDATE games SET diplomacy_phase_deadline = datetime(\'now\', \'-1 minute\') WHERE id = :id")->execute(["id" => $gameId]);',
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

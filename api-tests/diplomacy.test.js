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
  expect(afterOne.diplomacy.progress.submitted_count).toBe(1);
  expect(afterOne.diplomacy.my_orders).toBeNull();
  const hiddenActions = await player.client.get(`/api/games/${game.id}/actions?since_id=0`);
  expect(hiddenActions.status).toBe(200);
  expect(hiddenActions.body.data.actions.filter((row) => row.action_type === 'order')).toEqual([]);

  await submitOrders(player.client, game.id, playerPower, map);
  const afterSpring = await detail(owner.client, game.id);
  expect(afterSpring.phase).toBe('fall_orders');
  expect(afterSpring.current_round).toBe(1901);
  expect(afterSpring.diplomacy.history.some((item) => item.phase === 'spring_orders')).toBe(true);

  const ownerFall = await detail(owner.client, game.id);
  const playerFall = await detail(player.client, game.id);
  await submitOrders(owner.client, game.id, ownerFall.diplomacy.my_power, map);
  await submitOrders(player.client, game.id, playerFall.diplomacy.my_power, map);
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

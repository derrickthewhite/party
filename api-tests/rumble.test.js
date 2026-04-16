const { setUserAdmin } = require('./support/admin');
const { registerAndSignIn } = require('./support/auth');
const { getServerInfo } = require('./support/server-runtime');

async function getCurrentUser(client) {
  const response = await client.get('/api/auth/me');
  expect(response.status).toBe(200);
  return response.body.data.user;
}

async function getGameDetail(client, gameId) {
  const response = await client.get(`/api/games/${gameId}`);
  expect(response.status).toBe(200);
  return response.body.data.game;
}

function findRumblePlayer(gameDetail, userId) {
  return gameDetail.rumble_turn_progress.players.find((entry) => entry.user_id === userId);
}

function lastResolvedEventLog(gameDetail) {
  return gameDetail.status === 'closed'
    ? gameDetail.rumble_turn_progress.current_round_event_log
    : gameDetail.rumble_turn_progress.previous_round_event_log;
}

function eventsForUser(gameDetail, userId, effectKey) {
  return lastResolvedEventLog(gameDetail).filter(
    (entry) => entry.owner_user_id === userId && entry.effect_key === effectKey
  );
}

async function createStartedRumbleGame(label, options = {}) {
  const baseURL = getServerInfo().baseURL;
  const owner = await registerAndSignIn(baseURL, `${label}-owner`);
  const playerLabels = options.playerLabels || ['player'];
  const observerLabels = options.observerLabels || ['observer'];
  const players = [];
  const observers = [];

  for (const playerLabel of playerLabels) {
    players.push(await registerAndSignIn(baseURL, `${label}-${playerLabel}`));
  }

  for (const observerLabel of observerLabels) {
    observers.push(await registerAndSignIn(baseURL, `${label}-${observerLabel}`));
  }

  setUserAdmin(owner.credentials.username);

  const ownerMe = await getCurrentUser(owner.client);
  const playerUsers = [];
  const observerUsers = [];
  for (const player of players) {
    playerUsers.push(await getCurrentUser(player.client));
  }
  for (const observer of observers) {
    observerUsers.push(await getCurrentUser(observer.client));
  }
  expect(ownerMe.is_admin).toBe(1);

  const createResponse = await owner.client.post('/api/games', {
    json: {
      title: `rumble-${label}-${Date.now().toString(36)}`,
      game_type: 'rumble',
    },
  });
  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;

  for (const player of players) {
    expect((await player.client.post(`/api/games/${gameId}/join`)).status).toBe(200);
  }

  for (const observer of observers) {
    expect((await observer.client.post(`/api/games/${gameId}/observe`)).status).toBe(200);
  }

  const startResponse = await owner.client.post(`/api/games/${gameId}/start`);
  expect(startResponse.status).toBe(200);

  const detail = await getGameDetail(owner.client, gameId);
  expect(detail.rumble_turn_progress.phase_mode).toBe('bidding');
  expect(detail.rumble_turn_progress.offered_abilities.length).toBeGreaterThan(0);

  return {
    gameId,
    owner,
    ownerUserId: ownerMe.id,
    participants: [
      {
        ...owner,
        userId: ownerMe.id,
      },
      ...players.map((player, index) => ({
        ...player,
        userId: playerUsers[index].id,
      })),
    ],
    players: players.map((player, index) => ({
      ...player,
      userId: playerUsers[index].id,
    })),
    observers: observers.map((observer, index) => ({
      ...observer,
      userId: observerUsers[index].id,
    })),
    player: players[0],
    playerUserId: playerUsers[0] ? playerUsers[0].id : null,
    observer: observers[0],
    observerUserId: observerUsers[0] ? observerUsers[0].id : null,
  };
}

async function grantAbilities(client, gameId, userId, abilityIds) {
  const response = await client.post(`/api/games/${gameId}/actions/rumble-admin-grant-abilities`, {
    json: {
      user_id: userId,
      ability_ids: abilityIds,
    },
  });
  expect(response.status).toBe(200);
  return response.body.data;
}

async function revokeAbilities(client, gameId, userId, abilityIds) {
  const response = await client.post(`/api/games/${gameId}/actions/rumble-admin-revoke-abilities`, {
    json: {
      user_id: userId,
      ability_ids: abilityIds,
    },
  });
  expect(response.status).toBe(200);
  return response.body.data;
}

async function enterBattlePhase(ownerClient, gameId) {
  const response = await ownerClient.post(`/api/games/${gameId}/actions/rumble-bids/end`);
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(
    expect.objectContaining({
      resolved: true,
      phase: 'battle',
    })
  );
}

async function setHealth(client, gameId, userId, health, startingHealth) {
  const payload = {
    user_id: userId,
    health,
  };
  if (startingHealth !== undefined) {
    payload.starting_health = startingHealth;
  }

  const response = await client.post(`/api/games/${gameId}/actions/rumble-admin-set-health`, {
    json: payload,
  });
  expect(response.status).toBe(200);
  return response.body.data;
}

async function submitOrder(client, gameId, body) {
  const response = await client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: body,
  });
  expect(response.status).toBe(201);
  return response.body.data;
}

async function resolveRound(ownerClient, gameId) {
  const response = await ownerClient.post(`/api/games/${gameId}/actions/reveal`);
  expect(response.status).toBe(200);
  expect(response.body.data.resolved).toBe(true);
  return response.body.data;
}

test('admins can grant and revoke rumble abilities and detail exposes owned abilities', async () => {
  const { gameId, owner, player, playerUserId } = await createStartedRumbleGame('grant-revoke');

  const grantResult = await grantAbilities(owner.client, gameId, playerUserId, ['turbo_generator', 'cloaking_field']);
  expect(grantResult).toEqual(
    expect.objectContaining({
      granted: true,
      target_user_id: playerUserId,
      added_ability_ids: ['turbo_generator', 'cloaking_field'],
      owned_ability_ids: ['cloaking_field', 'turbo_generator'],
    })
  );

  const playerDetailAfterGrant = await getGameDetail(player.client, gameId);
  const playerEntryAfterGrant = playerDetailAfterGrant.rumble_turn_progress.players.find(
    (entry) => entry.user_id === playerUserId
  );
  expect(playerEntryAfterGrant.owned_abilities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'cloaking_field' }),
      expect.objectContaining({ id: 'turbo_generator' }),
    ])
  );

  const revokeResult = await revokeAbilities(owner.client, gameId, playerUserId, ['cloaking_field']);
  expect(revokeResult).toEqual(
    expect.objectContaining({
      revoked: true,
      target_user_id: playerUserId,
      removed_ability_ids: ['cloaking_field'],
      owned_ability_ids: ['turbo_generator'],
    })
  );

  const playerDetailAfterRevoke = await getGameDetail(player.client, gameId);
  const playerEntryAfterRevoke = playerDetailAfterRevoke.rumble_turn_progress.players.find(
    (entry) => entry.user_id === playerUserId
  );
  expect(playerEntryAfterRevoke.owned_abilities).toEqual([
    expect.objectContaining({ id: 'turbo_generator' }),
  ]);
});

test('rumble ability orders reject variable-cost activations without x_cost', async () => {
  const { gameId, owner, player, ownerUserId, playerUserId } = await createStartedRumbleGame('variable-cost');

  await grantAbilities(owner.client, gameId, playerUserId, ['mining_rig']);
  await enterBattlePhase(owner.client, gameId);

  const orderResponse = await player.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [ownerUserId]: 90,
      },
      ability_activations: [
        {
          ability_id: 'mining_rig',
        },
      ],
    },
  });

  expect(orderResponse.status).toBe(422);
  expect(orderResponse.body.error).toBe('x_cost is required for this variable-cost ability.');
});

test('rumble orders account for granted abilities when validating energy spend', async () => {
  const { gameId, owner, player, ownerUserId, playerUserId } = await createStartedRumbleGame('energy-budget');

  await grantAbilities(owner.client, gameId, playerUserId, ['turbo_generator', 'cloaking_field']);
  await enterBattlePhase(owner.client, gameId);

  const orderResponse = await player.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [ownerUserId]: 85,
      },
      ability_activations: [
        {
          ability_id: 'cloaking_field',
        },
      ],
    },
  });

  expect(orderResponse.status).toBe(201);
  expect(orderResponse.body.data).toEqual(
    expect.objectContaining({
      submitted: true,
      defense: 15,
      energy_budget: 110,
      attack_energy_spent: 85,
      ability_energy_spent: 25,
      total_energy_spent: 110,
    })
  );

  const playerDetail = await getGameDetail(player.client, gameId);
  expect(playerDetail.rumble_turn_progress.phase_mode).toBe('battle');
  expect(playerDetail.rumble_turn_progress.current_order).toEqual(
    expect.objectContaining({
      attacks: {
        [ownerUserId]: 85,
      },
      defense: 15,
      energy_budget: 110,
      attack_energy_spent: 85,
      ability_energy_spent: 25,
      total_energy_spent: 110,
      ability_activations: [
        expect.objectContaining({
          ability_id: 'cloaking_field',
        }),
      ],
    })
  );
});

test('two-player rumble basic attack and defense math resolves without abilities', async () => {
  const { gameId, owner, player, ownerUserId, playerUserId } = await createStartedRumbleGame('basic-math');

  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 80,
    },
    ability_activations: [],
  });
  await submitOrder(player.client, gameId, {
    attacks: {
      [ownerUserId]: 30,
    },
    ability_activations: [],
  });

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  const ownerEntry = findRumblePlayer(detail, ownerUserId);
  const playerEntry = findRumblePlayer(detail, playerUserId);

  expect(ownerEntry.health).toBe(90);
  expect(playerEntry.health).toBe(90);
  expect(detail.rumble_turn_progress.previous_round_orders).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        user_id: ownerUserId,
        attacks: {
          [playerUserId]: 80,
        },
        defense: 20,
      }),
      expect.objectContaining({
        user_id: playerUserId,
        attacks: {
          [ownerUserId]: 30,
        },
        defense: 70,
      }),
    ])
  );

  expect(eventsForUser(detail, ownerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 30,
        defense_available: 20,
        final_damage: 10,
        next_health: 90,
      }),
    }),
  ]);
  expect(eventsForUser(detail, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 80,
        defense_available: 70,
        final_damage: 10,
        next_health: 90,
      }),
    }),
  ]);
});

test('five-player rumble records eliminations and closes with a single winner', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('five-player-victory', {
    playerLabels: ['p1', 'p2', 'p3', 'p4'],
    observerLabels: [],
  });

  const [winner, ...others] = participants;
  for (const participant of others) {
    await setHealth(owner.client, gameId, participant.userId, 1, 1);
  }

  await enterBattlePhase(owner.client, gameId);
  await submitOrder(winner.client, gameId, {
    attacks: Object.fromEntries(others.map((participant) => [participant.userId, 2])),
    ability_activations: [],
  });

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(detail.status).toBe('closed');
  expect(detail.final_standings).toEqual(
    expect.objectContaining({
      winner_name: winner.credentials.username,
    })
  );
  expect(detail.final_standings.entries).toHaveLength(5);
  expect(detail.final_standings.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        user_id: winner.userId,
        rank: 1,
        result_status: 'winner',
      }),
      ...others.map((participant) =>
        expect.objectContaining({
          user_id: participant.userId,
          eliminated_round: 1,
          result_status: 'eliminated',
        })
      ),
    ])
  );
});

test('armor, heavy armor, automated repair systems, and replicators stack correctly in two-player rumble', async () => {
  const { gameId, owner, player, ownerUserId, playerUserId } = await createStartedRumbleGame('armor-healing');

  await grantAbilities(owner.client, gameId, playerUserId, ['armor', 'heavy_armor']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 20,
    },
    ability_activations: [],
  });
  await submitOrder(player.client, gameId, {
    attacks: {
      [ownerUserId]: 95,
    },
    ability_activations: [],
  });

  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(100);
  expect(eventsForUser(detail, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 5,
        defense_available: 5,
        final_damage: 0,
        next_health: 100,
      }),
    }),
  ]);

  await grantAbilities(owner.client, gameId, playerUserId, ['automated_repair_systems', 'replicators']);
  await setHealth(owner.client, gameId, playerUserId, 95, 100);

  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(105);
  expect(eventsForUser(detail, playerUserId, 'step2:passive_round_start_heal')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          source_ability_id: 'automated_repair_systems',
          amount: 5,
        }),
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          source_ability_id: 'replicators',
          amount: 5,
        }),
      }),
    ])
  );

  await revokeAbilities(owner.client, gameId, playerUserId, ['replicators']);
  await setHealth(owner.client, gameId, playerUserId, 100, 100);

  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(100);
  expect(eventsForUser(detail, playerUserId, 'step2:passive_round_start_heal')).toEqual([]);
});

test('courier mission wins at the end of round 10 while the owner is alive', async () => {
  const { gameId, owner, player, playerUserId } = await createStartedRumbleGame('courier-mission');

  await grantAbilities(owner.client, gameId, playerUserId, ['courier_mission']);
  await enterBattlePhase(owner.client, gameId);

  for (let round = 1; round <= 10; round += 1) {
    await resolveRound(owner.client, gameId);
  }

  const detail = await getGameDetail(player.client, gameId);
  expect(detail.status).toBe('closed');
  expect(detail.final_standings).toEqual(
    expect.objectContaining({
      winner_name: player.credentials.username,
    })
  );
  expect(detail.final_standings.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        user_id: playerUserId,
        rank: 1,
        result_status: 'winner',
      }),
    ])
  );
});

test('death ray increases a single attack by fifty percent in a two-player round', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('death-ray-single');

  await grantAbilities(owner.client, gameId, ownerUserId, ['death_ray']);
  await setHealth(owner.client, gameId, playerUserId, 25, 25);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 20,
    },
    ability_activations: [],
  });

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(20);
  expect(eventsForUser(detail, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 30,
        defense_available: 25,
        final_damage: 5,
        next_health: 20,
      }),
    }),
  ]);
});

test('death ray does NOT amplify when making multiple attacks in a three-player round', async () => {
  const { gameId, owner, ownerUserId, participants } = await createStartedRumbleGame('death-ray', {
    playerLabels: ['p1', 'p2'],
    observerLabels: [],
  });

  const [, target1, target2] = participants;

  await grantAbilities(owner.client, gameId, ownerUserId, ['death_ray']);
  await setHealth(owner.client, gameId, target1.userId, 25, 25);
  await setHealth(owner.client, gameId, target2.userId, 25, 25);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [target1.userId]: 20,
      [target2.userId]: 20,
    },
    ability_activations: [],
  });

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target1.userId).health).toBe(25);
  expect(findRumblePlayer(detail, target2.userId).health).toBe(25);
  expect(eventsForUser(detail, target1.userId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 20,
        defense_available: 25,
        final_damage: 0,
        next_health: 25,
      }),
    }),
  ]);
  expect(eventsForUser(detail, target2.userId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 20,
        defense_available: 25,
        final_damage: 0,
        next_health: 25,
      }),
    }),
  ]);
});

test('backup generator restores a defeated player when two opponents kill them in a three-player round', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('backup-generator', {
    playerLabels: ['target', 'attacker'],
    observerLabels: [],
  });

  const [, target, attacker] = participants;

  await grantAbilities(owner.client, gameId, target.userId, ['backup_generator']);
  await setHealth(owner.client, gameId, target.userId, 10, 100);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [target.userId]: 20,
    },
    ability_activations: [],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [target.userId]: 20,
    },
    ability_activations: [],
  });

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(detail.status).toBe('in_progress');
  expect(findRumblePlayer(detail, target.userId).health).toBe(30);
  expect(findRumblePlayer(detail, target.userId).owned_abilities).toEqual([]);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        restored_health: 30,
      }),
    }),
  ]);
});
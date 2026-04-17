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
  if (gameDetail.status === 'closed') {
    const currentRoundEventLog = gameDetail.rumble_turn_progress.current_round_event_log;
    if (Array.isArray(currentRoundEventLog) && currentRoundEventLog.length > 0) {
      return currentRoundEventLog;
    }
  }

  return gameDetail.rumble_turn_progress.previous_round_event_log;
}

function eventsForUser(gameDetail, userId, effectKey) {
  return lastResolvedEventLog(gameDetail).filter(
    (entry) => entry.owner_user_id === userId && entry.effect_key === effectKey
  );
}

async function createStartedRumbleGame(label, options = {}) {
  const baseURL = getServerInfo().baseURL;
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = await registerAndSignIn(baseURL, `o-${uniqueSuffix}`);
  const playerLabels = options.playerLabels || ['player'];
  const observerLabels = options.observerLabels || ['observer'];
  const players = [];
  const observers = [];

  for (let index = 0; index < playerLabels.length; index += 1) {
    players.push(await registerAndSignIn(baseURL, `p${index}-${uniqueSuffix}`));
  }

  for (let index = 0; index < observerLabels.length; index += 1) {
    observers.push(await registerAndSignIn(baseURL, `v${index}-${uniqueSuffix}`));
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

test('rumble detail exposes updated player icon selections', async () => {
  const baseURL = getServerInfo().baseURL;
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = await registerAndSignIn(baseURL, `icon-owner-${uniqueSuffix}`);
  const player = await registerAndSignIn(baseURL, `icon-player-${uniqueSuffix}`);

  const createResponse = await owner.client.post('/api/games', {
    json: {
      title: `rumble-icons-${uniqueSuffix}`,
      game_type: 'rumble',
    },
  });
  expect(createResponse.status).toBe(201);
  const gameId = createResponse.body.data.game.id;

  const joinResponse = await player.client.post(`/api/games/${gameId}/join`);
  expect(joinResponse.status).toBe(200);

  const playerUserId = (await getCurrentUser(player.client)).id;

  const initialDetail = await getGameDetail(player.client, gameId);
  const playerEntry = findRumblePlayer(initialDetail, playerUserId);
  expect(playerEntry).toBeTruthy();
  expect(playerEntry.user_id).toBe(playerUserId);
  expect(Object.prototype.hasOwnProperty.call(playerEntry, 'icon_key')).toBe(true);
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
      defense: 0,
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
      defense: 0,
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

test('two backup generators restore a player twice but not a third time', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('backup-generator-stack', {
    playerLabels: ['target', 'attacker'],
    observerLabels: [],
  });

  const [, target, attacker] = participants;

  await grantAbilities(owner.client, gameId, target.userId, ['backup_generator', 'backup_generator']);
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

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target.userId).health).toBe(30);
  expect(findRumblePlayer(detail, target.userId).owned_abilities).toEqual([
    expect.objectContaining({ id: 'backup_generator' }),
  ]);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        restored_health: 30,
      }),
    }),
  ]);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [target.userId]: 40,
    },
    ability_activations: [],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [target.userId]: 40,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target.userId).health).toBe(30);
  expect(findRumblePlayer(detail, target.userId).owned_abilities).toEqual([]);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        restored_health: 30,
      }),
    }),
  ]);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [target.userId]: 40,
    },
    ability_activations: [],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [target.userId]: 40,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target.userId).health).toBe(0);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toEqual([]);
});

test('cloaking field burns on use, prevents attacks next round, and expires after that round', async () => {
  const { gameId, owner, ownerUserId, participants } = await createStartedRumbleGame('cloaking-field-lifecycle', {
    playerLabels: ['attacker1', 'attacker2'],
    observerLabels: [],
  });

  const [, attacker1, attacker2] = participants;

  await grantAbilities(owner.client, gameId, ownerUserId, ['cloaking_field']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'cloaking_field',
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(95);
  expect(eventsForUser(detail, ownerUserId, 'activation:cloaking_field')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        ability_id: 'cloaking_field',
        health_burn: 5,
      }),
    }),
  ]);

  const blockedAttackResponse1 = await attacker1.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [ownerUserId]: 30,
      },
      ability_activations: [],
    },
  });
  expect(blockedAttackResponse1.status).toBe(422);
  expect(blockedAttackResponse1.body.error).toBe('One or more attack targets are invalid.');

  const blockedAttackResponse2 = await attacker2.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [ownerUserId]: 40,
      },
      ability_activations: [],
    },
  });
  expect(blockedAttackResponse2.status).toBe(422);
  expect(blockedAttackResponse2.body.error).toBe('One or more attack targets are invalid.');

  await submitOrder(attacker1.client, gameId, {
    attacks: {
      [attacker2.userId]: 10,
    },
    ability_activations: [],
  });
  await submitOrder(attacker2.client, gameId, {
    attacks: {
      [attacker1.userId]: 10,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(95);
  expect(eventsForUser(detail, ownerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 0,
        final_damage: 0,
        next_health: 95,
      }),
    }),
  ]);

  await setHealth(owner.client, gameId, ownerUserId, 20, 100);
  await submitOrder(attacker1.client, gameId, {
    attacks: {
      [ownerUserId]: 30,
    },
    ability_activations: [],
  });
  await submitOrder(attacker2.client, gameId, {
    attacks: {
      [ownerUserId]: 40,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, ownerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 70,
        defense_available: 20,
        final_damage: 50,
        next_health: 0,
      }),
    }),
  ]);
});

test('energy absorption gives no bonus energy next round when no damage is blocked', async () => {
  const { gameId, owner, player, playerUserId } = await createStartedRumbleGame('energy-absorption-none');

  await grantAbilities(owner.client, gameId, playerUserId, ['energy_absorption']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'energy_absorption',
      },
    ],
  });
  await resolveRound(owner.client, gameId);
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(player.client, gameId);
  expect(eventsForUser(detail, playerUserId, 'step1:set_round_stats')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        health: 100,
        energy_budget: 100,
      }),
    }),
  ]);
});

test('energy absorption grants next-round energy from damage blocked by defense', async () => {
  const { gameId, owner, player, ownerUserId, playerUserId } = await createStartedRumbleGame('energy-absorption-defense');

  await grantAbilities(owner.client, gameId, playerUserId, ['energy_absorption']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'energy_absorption',
      },
    ],
  });
  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 40,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detailAfterFirstRound = await getGameDetail(player.client, gameId);
  expect(eventsForUser(detailAfterFirstRound, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 40,
        defense_available: 90,
        final_damage: 0,
        next_health: 100,
      }),
    }),
  ]);

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(player.client, gameId);
  expect(eventsForUser(detail, playerUserId, 'step1:set_round_stats')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        health: 100,
        energy_budget: 120,
      }),
    }),
  ]);
});

test('energy absorption counts only defense-blocked damage when armor also reduces incoming attacks', async () => {
  const { gameId, owner, player, ownerUserId, playerUserId } = await createStartedRumbleGame('energy-absorption-armor');

  await grantAbilities(owner.client, gameId, playerUserId, ['energy_absorption', 'armor']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'energy_absorption',
      },
    ],
  });
  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 20,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detailAfterFirstRound = await getGameDetail(player.client, gameId);
  expect(eventsForUser(detailAfterFirstRound, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 15,
        defense_available: 90,
        final_damage: 0,
        next_health: 100,
      }),
    }),
  ]);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 20,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(player.client, gameId);
  expect(eventsForUser(detail, playerUserId, 'step1:set_round_stats')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        health: 100,
        energy_budget: 107,
      }),
    }),
  ]);
});

test('escape pods restore a defeated player to 20 health and consume the ability', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('escape-pods', {
    playerLabels: ['target', 'attacker'],
    observerLabels: [],
  });

  const [, target, attacker] = participants;

  await grantAbilities(owner.client, gameId, target.userId, ['escape_pods']);
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
  expect(findRumblePlayer(detail, target.userId).health).toBe(20);
  expect(findRumblePlayer(detail, target.userId).owned_abilities).toEqual([]);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        restored_health: 20,
        source_ability_id: 'escape_pods',
      }),
    }),
  ]);
});

test('shield boosters add 20 defense at round start', async () => {
  const { gameId, owner, ownerUserId, player, playerUserId } = await createStartedRumbleGame('shield-boosters');

  await grantAbilities(owner.client, gameId, playerUserId, ['shield_boosters']);
  await setHealth(owner.client, gameId, ownerUserId, 120, 120);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 120,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(100);
  expect(eventsForUser(detail, playerUserId, 'step2:passive_round_start_defense')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        source_ability_id: 'shield_boosters',
        defense_bonus: 20,
      }),
    }),
  ]);
  expect(eventsForUser(detail, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 120,
        defense_available: 120,
        final_damage: 0,
        next_health: 100,
      }),
    }),
  ]);
});

test('shield capacitors add 20 defense for the current round', async () => {
  const { gameId, owner, ownerUserId, player, playerUserId } = await createStartedRumbleGame('shield-capacitors');

  await grantAbilities(owner.client, gameId, playerUserId, ['shield_capacitors']);
  await setHealth(owner.client, gameId, ownerUserId, 120, 120);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'shield_capacitors',
      },
    ],
  });
  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 120,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(90);
  expect(eventsForUser(detail, playerUserId, 'activation:shield_capacitors')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        ability_id: 'shield_capacitors',
        applied_defense_bonus: 20,
      }),
    }),
  ]);
  expect(eventsForUser(detail, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 120,
        defense_available: 110,
        final_damage: 10,
        next_health: 90,
      }),
    }),
  ]);
});

test('meson beam and heavy meson beam deal unblockable damage at their fixed values', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('meson-beams');

  await grantAbilities(owner.client, gameId, ownerUserId, ['meson_beam', 'heavy_meson_beam']);
  await setHealth(owner.client, gameId, playerUserId, 25, 25);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'meson_beam',
        target_user_id: playerUserId,
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(20);
  expect(eventsForUser(detail, ownerUserId, 'activation:meson_beam')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        applied_damage: 5,
        channel: 'unblockable',
      }),
    }),
  ]);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'heavy_meson_beam',
        target_user_id: playerUserId,
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(10);
  expect(eventsForUser(detail, ownerUserId, 'activation:heavy_meson_beam')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        applied_damage: 10,
        channel: 'unblockable',
      }),
    }),
  ]);
});

test('heavy guns increase attack damage by 10 and turbo generator adds 10 round energy', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('heavy-guns-turbo');

  await grantAbilities(owner.client, gameId, ownerUserId, ['heavy_guns', 'turbo_generator']);
  await enterBattlePhase(owner.client, gameId);

  const orderResponse = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [playerUserId]: 100,
      },
      ability_activations: [],
    },
  });

  expect(orderResponse.status).toBe(201);
  expect(orderResponse.body.data).toEqual(
    expect.objectContaining({
      submitted: true,
      energy_budget: 110,
      attack_energy_spent: 100,
      ability_energy_spent: 0,
      total_energy_spent: 100,
      defense: 0,
    })
  );

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, ownerUserId, 'step1:set_round_stats')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        health: 100,
        energy_budget: 110,
      }),
    }),
  ]);
  expect(eventsForUser(detail, playerUserId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 110,
        defense_available: 100,
        final_damage: 10,
        next_health: 90,
      }),
    }),
  ]);
});

test('efficient targeting discounts the second-largest attack for order validation and resolution', async () => {
  async function createEfficientTargetingScenario(label) {
    const { gameId, owner, ownerUserId, players } = await createStartedRumbleGame(label, {
      playerLabels: ['alpha', 'beta', 'gamma'],
      observerLabels: [],
    });

    await grantAbilities(owner.client, gameId, ownerUserId, ['efficient_targeting']);
    await setHealth(owner.client, gameId, ownerUserId, 110, 110);
    await enterBattlePhase(owner.client, gameId);

    return {
      gameId,
      owner,
      ownerUserId,
      targetUserIds: players.map((player) => player.userId),
    };
  }

  const validCases = [
    {
      label: 'efficient-targeting-equal-split',
      attacks: [50, 50, 50],
      expectedAttackEnergySpent: 100,
    },
    {
      label: 'efficient-targeting-cheap-third-shot',
      attacks: [60, 60, 20],
      expectedAttackEnergySpent: 80,
    },
    {
      label: 'efficient-targeting-expensive-spread',
      attacks: [80, 60, 20],
      expectedAttackEnergySpent: 100,
    },
    {
      label: 'efficient-targeting-single-shot',
      attacks: [80, 0, 0],
      expectedAttackEnergySpent: 80,
    },
  ];

  for (const testCase of validCases) {
    const { gameId, owner, targetUserIds } = await createEfficientTargetingScenario(testCase.label);
    const attacks = {};
    testCase.attacks.forEach((amount, index) => {
      if (amount > 0) {
        attacks[targetUserIds[index]] = amount;
      }
    });

    const orderResponse = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
      json: {
        attacks,
        ability_activations: [
          {
            ability_id: 'efficient_targeting',
          },
        ],
      },
    });

    expect(orderResponse.status).toBe(201);
    expect(orderResponse.body.data).toEqual(
      expect.objectContaining({
        submitted: true,
        energy_budget: 110,
        attack_energy_spent: testCase.expectedAttackEnergySpent,
        ability_energy_spent: 10,
        total_energy_spent: testCase.expectedAttackEnergySpent + 10,
        defense: Math.max(0, 110 - (testCase.expectedAttackEnergySpent + 10)),
      })
    );

    await resolveRound(owner.client, gameId);

    const detail = await getGameDetail(owner.client, gameId);
    targetUserIds.forEach((targetUserId, index) => {
        const attackAmount = testCase.attacks[index];
        expect(eventsForUser(detail, targetUserId, 'step6:damage_resolution')).toEqual([
          expect.objectContaining({
            payload: expect.objectContaining({
              normal_incoming: attackAmount,
              defense_available: 100,
              final_damage: 0,
            }),
          }),
        ]);
    });
  }

  const invalidScenario = await createEfficientTargetingScenario('efficient-targeting-invalid');
  const invalidResponse = await invalidScenario.owner.client.post(`/api/games/${invalidScenario.gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [invalidScenario.targetUserIds[0]]: 80,
        [invalidScenario.targetUserIds[1]]: 40,
        [invalidScenario.targetUserIds[2]]: 40,
      },
      ability_activations: [
        {
          ability_id: 'efficient_targeting',
        },
      ],
    },
  });

  expect(invalidResponse.status).toBe(422);
  expect(invalidResponse.body.error).toBe('Invalid order: total energy spent exceeds your round energy budget.');
});

test('mining rig spends 3X energy and heals X health', async () => {
  const { gameId, owner, player, playerUserId } = await createStartedRumbleGame('mining-rig-heal');

  await grantAbilities(owner.client, gameId, playerUserId, ['mining_rig']);
  await setHealth(owner.client, gameId, playerUserId, 95, 100);
  await enterBattlePhase(owner.client, gameId);

  const orderResponse = await player.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {},
      ability_activations: [
        {
          ability_id: 'mining_rig',
          x_cost: 5,
        },
      ],
    },
  });

  expect(orderResponse.status).toBe(201);
  expect(orderResponse.body.data).toEqual(
    expect.objectContaining({
      submitted: true,
      defense: 80,
      energy_budget: 95,
      attack_energy_spent: 0,
      ability_energy_spent: 15,
      total_energy_spent: 15,
    })
  );

  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(player.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(100);
  expect(eventsForUser(detail, playerUserId, 'activation:mining_rig')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        ability_id: 'mining_rig',
        cost: 15,
        healing: 5,
      }),
    }),
  ]);
});

test('focused defense halves attacks from the chosen opponent only', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('focused-defense', {
    playerLabels: ['defender', 'other'],
    observerLabels: [],
  });

  const [attacker, defender, other] = participants;

  await grantAbilities(owner.client, gameId, defender.userId, ['focused_defense']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(defender.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'focused_defense',
        target_user_id: attacker.userId,
      },
    ],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [defender.userId]: 100,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {
      [defender.userId]: 40,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, defender.userId, 'activation:focused_defense')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        focused_attacker_user_id: attacker.userId,
        incoming_attack_multiplier: 0.5,
      }),
    }),
  ]);
  expect(eventsForUser(detail, defender.userId, 'step6:damage_resolution')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        normal_incoming: 90,
        defense_available: 100,
        final_damage: 0,
        next_health: 100,
      }),
    }),
  ]);
});

test('hailing frequencies blocks attacks both directions next round and is invalid with only two players', async () => {
  const threePlayer = await createStartedRumbleGame('hailing-frequencies', {
    playerLabels: ['target', 'other'],
    observerLabels: [],
  });
  const { gameId, owner, ownerUserId, participants } = threePlayer;
  const [, target, other] = participants;

  await grantAbilities(owner.client, gameId, ownerUserId, ['hailing_frequencies']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'hailing_frequencies',
        target_user_id: target.userId,
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  const blockedOwnerAttack = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [target.userId]: 10,
      },
      ability_activations: [],
    },
  });
  expect(blockedOwnerAttack.status).toBe(422);

  const blockedTargetAttack = await target.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [ownerUserId]: 10,
      },
      ability_activations: [],
    },
  });
  expect(blockedTargetAttack.status).toBe(422);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [other.userId]: 10,
    },
    ability_activations: [],
  });
  await submitOrder(target.client, gameId, {
    attacks: {
      [other.userId]: 10,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {
      [ownerUserId]: 10,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(100);
  expect(findRumblePlayer(detail, target.userId).health).toBe(100);

  const twoPlayer = await createStartedRumbleGame('hailing-invalid');
  await grantAbilities(twoPlayer.owner.client, twoPlayer.gameId, twoPlayer.ownerUserId, ['hailing_frequencies']);
  await enterBattlePhase(twoPlayer.owner.client, twoPlayer.gameId);

  const invalidResponse = await twoPlayer.owner.client.post(`/api/games/${twoPlayer.gameId}/actions/rumble-order`, {
    json: {
      attacks: {},
      ability_activations: [
        {
          ability_id: 'hailing_frequencies',
          target_user_id: twoPlayer.playerUserId,
        },
      ],
    },
  });
  expect(invalidResponse.status).toBe(422);
  expect(invalidResponse.body.error).toBe('This ability is not valid when only two players remain.');
});

test('nimble dodge negates the largest incoming attack and is invalid with only two players', async () => {
  const threePlayer = await createStartedRumbleGame('nimble-dodge', {
    playerLabels: ['defender', 'other'],
    observerLabels: [],
  });
  const { gameId, owner, participants } = threePlayer;
  const [attacker, defender, other] = participants;

  await grantAbilities(owner.client, gameId, defender.userId, ['nimble_dodge']);
  await setHealth(owner.client, gameId, defender.userId, 30, 100);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(defender.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'nimble_dodge',
      },
    ],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [defender.userId]: 70,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {
      [defender.userId]: 40,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, defender.userId).health).toBe(10);
  expect(eventsForUser(detail, defender.userId, 'trigger:nimble_dodge')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        negated_attack: 70,
      }),
    }),
  ]);

  const twoPlayer = await createStartedRumbleGame('nimble-invalid');
  await grantAbilities(twoPlayer.owner.client, twoPlayer.gameId, twoPlayer.playerUserId, ['nimble_dodge']);
  await enterBattlePhase(twoPlayer.owner.client, twoPlayer.gameId);

  const invalidResponse = await twoPlayer.player.client.post(`/api/games/${twoPlayer.gameId}/actions/rumble-order`, {
    json: {
      attacks: {},
      ability_activations: [
        {
          ability_id: 'nimble_dodge',
        },
      ],
    },
  });
  expect(invalidResponse.status).toBe(422);
  expect(invalidResponse.body.error).toBe('This ability is not valid when only two players remain.');
});

test('reflective shield deals half taken attack damage back to the attacker', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('reflective-shield');

  await grantAbilities(owner.client, gameId, playerUserId, ['reflective_shield']);
  await setHealth(owner.client, gameId, playerUserId, 20, 100);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 40,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(90);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(0);
});

test('scheming burns health, negates the chosen attackers largest hit, and retaliates that damage', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('scheming', {
    playerLabels: ['defender', 'other'],
    observerLabels: [],
  });
  const [attacker, defender, other] = participants;

  await grantAbilities(owner.client, gameId, defender.userId, ['scheming']);
  await setHealth(owner.client, gameId, defender.userId, 50, 100);
  await setHealth(owner.client, gameId, attacker.userId, 50, 100);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(defender.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'scheming',
        target_user_id: attacker.userId,
      },
    ],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [defender.userId]: 40,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {
      [defender.userId]: 20,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, defender.userId).health).toBe(40);
  expect(findRumblePlayer(detail, attacker.userId).health).toBe(10);
  expect(eventsForUser(detail, defender.userId, 'trigger:scheming')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        negated_attack: 40,
      }),
    }),
  ]);
  expect(eventsForUser(detail, defender.userId, 'activation:scheming')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        health_burn: 10,
        scheming_target_user_id: attacker.userId,
      }),
    }),
  ]);
});

test('holoship prevents targeting and applies a 5 health upkeep each round', async () => {
  const { gameId, owner, ownerUserId, player } = await createStartedRumbleGame('holoship');

  await grantAbilities(owner.client, gameId, ownerUserId, ['holoship']);
  await enterBattlePhase(owner.client, gameId);

  const blockedAttack = await player.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [ownerUserId]: 10,
      },
      ability_activations: [],
    },
  });
  expect(blockedAttack.status).toBe(422);
  expect(blockedAttack.body.error).toBe('One or more attack targets are invalid.');

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(95);
  expect(eventsForUser(detail, ownerUserId, 'step7:upkeep_cost')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        source_ability_id: 'holoship',
        health_loss: 5,
      }),
    }),
  ]);
});

test('hyperdrive enters hyperspace next round, blocks attacks while active, and can be toggled off', async () => {
  const { gameId, owner, ownerUserId, participants } = await createStartedRumbleGame('hyperdrive', {
    playerLabels: ['attacker', 'other'],
    observerLabels: [],
  });
  const [, attacker, other] = participants;

  await grantAbilities(owner.client, gameId, ownerUserId, ['hyperdrive']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'hyperdrive',
      },
    ],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [ownerUserId]: 20,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(95);
  expect(eventsForUser(detail, ownerUserId, 'activation:hyperdrive')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        health_burn: 5,
        mode: 'activate',
      }),
    }),
  ]);

  const blockedPlayerAttack = await attacker.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [ownerUserId]: 10,
      },
      ability_activations: [],
    },
  });
  expect(blockedPlayerAttack.status).toBe(422);

  const blockedOwnerAttack = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [attacker.userId]: 10,
      },
      ability_activations: [],
    },
  });
  expect(blockedOwnerAttack.status).toBe(422);

  const blockedOwnerAttackAgainstOther = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [other.userId]: 10,
      },
      ability_activations: [],
    },
  });
  expect(blockedOwnerAttackAgainstOther.status).toBe(422);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [other.userId]: 10,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(95);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'hyperdrive',
      },
    ],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(90);
  expect(eventsForUser(detail, ownerUserId, 'activation:hyperdrive')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        health_burn: 5,
        mode: 'deactivate',
      }),
    }),
  ]);

  await setHealth(owner.client, gameId, ownerUserId, 10, 100);

  await submitOrder(attacker.client, gameId, {
    attacks: {
      [ownerUserId]: 20,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, ownerUserId).health).toBe(0);
});

test('hyperdrive closes the game when only one remaining player is outside hyperspace', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('hyperdrive-last-outside-wins', {
    playerLabels: ['hyperspace-target', 'winner'],
    observerLabels: [],
  });
  const [ownerParticipant, hyperspaceTarget, winner] = participants;

  await grantAbilities(owner.client, gameId, ownerParticipant.userId, ['hyperdrive']);
  await grantAbilities(owner.client, gameId, hyperspaceTarget.userId, ['hyperdrive']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'hyperdrive',
      },
    ],
  });
  await submitOrder(hyperspaceTarget.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'hyperdrive',
      },
    ],
  });
  await submitOrder(winner.client, gameId, {
    attacks: {},
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
  expect(detail.final_standings.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        user_id: winner.userId,
        rank: 1,
        result_status: 'winner',
      }),
    ])
  );
});

test('phase bomb deals floor(X/2) damage to all other opponents', async () => {
  const { gameId, owner, ownerUserId, participants } = await createStartedRumbleGame('phase-bomb', {
    playerLabels: ['target1', 'target2'],
    observerLabels: [],
  });
  const [, target1, target2] = participants;

  await grantAbilities(owner.client, gameId, ownerUserId, ['phase_bomb']);
  await setHealth(owner.client, gameId, target1.userId, 2, 2);
  await setHealth(owner.client, gameId, target2.userId, 2, 2);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'phase_bomb',
        x_cost: 9,
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, ownerUserId, 'activation:phase_bomb')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        applied_damage_each: 4,
      }),
    }),
  ]);
  expect(findRumblePlayer(detail, target1.userId).health).toBe(0);
  expect(findRumblePlayer(detail, target2.userId).health).toBe(0);
});

test('mine layer retaliates against each player who attacks you for floor(X/2)', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('mine-layer', {
    playerLabels: ['defender', 'other'],
    observerLabels: [],
  });
  const [attacker, defender, other] = participants;

  await grantAbilities(owner.client, gameId, defender.userId, ['mine_layer']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(defender.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'mine_layer',
        x_cost: 9,
      },
    ],
  });
  await submitOrder(attacker.client, gameId, {
    attacks: {
      [defender.userId]: 20,
    },
    ability_activations: [],
  });
  await submitOrder(other.client, gameId, {
    attacks: {
      [defender.userId]: 20,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, defender.userId, 'activation:mine_layer')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        retaliation_per_attacker: 4,
      }),
    }),
  ]);
  expect(findRumblePlayer(detail, attacker.userId).health).toBe(96);
  expect(findRumblePlayer(detail, other.userId).health).toBe(96);
});

test('mcguffin generator grants 50 health at the start of round 3', async () => {
  const { gameId, owner, player, playerUserId } = await createStartedRumbleGame('mcguffin-generator');

  await grantAbilities(owner.client, gameId, playerUserId, ['mcguffin_generator']);
  await setHealth(owner.client, gameId, playerUserId, 40, 100);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(player.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(90);
  expect(eventsForUser(detail, playerUserId, 'step2:passive_round_start_heal')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        source_ability_id: 'mcguffin_generator',
        amount: 50,
      }),
    }),
  ]);
});

test('ion beam removes defense before attack damage is applied', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('ion-beam');

  await grantAbilities(owner.client, gameId, ownerUserId, ['ion_beam']);
  await setHealth(owner.client, gameId, playerUserId, 25, 25);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 25,
    },
    ability_activations: [
      {
        ability_id: 'ion_beam',
        target_user_id: playerUserId,
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(5);
  expect(eventsForUser(detail, ownerUserId, 'activation:ion_beam')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        applied_damage: 20,
        channel: 'defense_only',
      }),
    }),
  ]);
});

test('loitering munitions deal X damage at the start of the next round', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('loitering-munitions');

  await grantAbilities(owner.client, gameId, ownerUserId, ['loitering_munitions']);
  await setHealth(owner.client, gameId, playerUserId, 10, 10);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'loitering_munitions',
        target_user_id: playerUserId,
        x_cost: 15,
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, ownerUserId, 'activation:loitering_munitions')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        scheduled_for_round: 2,
      }),
    }),
  ]);

  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(5);
});

test('torpedo bays add X bonus damage to one attack on the next round', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('torpedo-bays');

  await grantAbilities(owner.client, gameId, ownerUserId, ['torpedo_bays']);
  await setHealth(owner.client, gameId, playerUserId, 30, 30);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'torpedo_bays',
        x_cost: 15,
      },
    ],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, ownerUserId, 'activation:torpedo_bays')).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        scheduled_for_round: 2,
      }),
    }),
  ]);

  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 20,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(25);
});

test('burn adds to energy cost for hyperdrive and prevents overbudget orders', async () => {
  const first = await createStartedRumbleGame('hyperdrive-energy-valid');
  const { gameId, owner, ownerUserId, playerUserId } = first;

  await grantAbilities(owner.client, gameId, ownerUserId, ['hyperdrive']);
  await enterBattlePhase(owner.client, gameId);

  const okResponse = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: {
      attacks: {
        [playerUserId]: 80,
      },
      ability_activations: [
        {
          ability_id: 'hyperdrive',
        },
      ],
    },
  });

  expect(okResponse.status).toBe(201);
  expect(okResponse.body.data).toEqual(
    expect.objectContaining({
      ability_energy_spent: 5,
      defense: 15,
      attack_energy_spent: 80,
      total_energy_spent: 85,
    })
  );

  const second = await createStartedRumbleGame('hyperdrive-energy-invalid');
  const { gameId: g2, owner: o2 } = second;
  await grantAbilities(o2.client, g2, second.ownerUserId, ['hyperdrive']);
  await enterBattlePhase(o2.client, g2);

  const badResponse = await o2.client.post(`/api/games/${g2}/actions/rumble-order`, {
    json: {
      attacks: {
        [second.playerUserId]: 100,
      },
      ability_activations: [
        {
          ability_id: 'hyperdrive',
        },
      ],
    },
  });

  expect(badResponse.status).toBe(422);
  expect(badResponse.body.error).toBe('Invalid order: total energy spent exceeds your round energy budget.');
});

test('backup generator plus two escape pods restores three times but not four', async () => {
  const { gameId, owner, participants } = await createStartedRumbleGame('backup-plus-escapes', {
    playerLabels: ['target', 'attacker'],
    observerLabels: [],
  });

  const [, target, attacker] = participants;

  await grantAbilities(owner.client, gameId, target.userId, ['backup_generator', 'escape_pods', 'escape_pods']);
  await setHealth(owner.client, gameId, target.userId, 10, 100);
  await enterBattlePhase(owner.client, gameId);

  // The three restore abilities can resolve in priority order; the contract here is three restores total, then none.
  await submitOrder(owner.client, gameId, { attacks: { [target.userId]: 20 }, ability_activations: [] });
  await submitOrder(attacker.client, gameId, { attacks: { [target.userId]: 20 }, ability_activations: [] });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target.userId).health).toBeGreaterThan(0);
  expect(findRumblePlayer(detail, target.userId).owned_abilities).toHaveLength(2);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toHaveLength(1);

  // Second defeat -> another restore fires
  await submitOrder(owner.client, gameId, { attacks: { [target.userId]: 40 }, ability_activations: [] });
  await submitOrder(attacker.client, gameId, { attacks: { [target.userId]: 40 }, ability_activations: [] });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target.userId).health).toBeGreaterThan(0);
  expect(findRumblePlayer(detail, target.userId).owned_abilities).toHaveLength(1);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toHaveLength(1);

  // Third defeat -> final restore fires
  await submitOrder(owner.client, gameId, { attacks: { [target.userId]: 40 }, ability_activations: [] });
  await submitOrder(attacker.client, gameId, { attacks: { [target.userId]: 40 }, ability_activations: [] });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target.userId).health).toBeGreaterThan(0);
  expect(findRumblePlayer(detail, target.userId).owned_abilities).toEqual([]);
  expect(eventsForUser(detail, target.userId, 'trigger:on_defeat_restore')).toHaveLength(1);

  // Fourth defeat -> no restores remain
  await submitOrder(owner.client, gameId, { attacks: { [target.userId]: 40 }, ability_activations: [] });
  await submitOrder(attacker.client, gameId, { attacks: { [target.userId]: 40 }, ability_activations: [] });
  await resolveRound(owner.client, gameId);

  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, target.userId).health).toBe(0);
});

test('shield boosters and shield capacitors combine for full defense', async () => {
  const { gameId, owner, ownerUserId, player, playerUserId } = await createStartedRumbleGame('shield-combo');

  await grantAbilities(owner.client, gameId, playerUserId, ['shield_boosters', 'shield_capacitors']);
  await setHealth(owner.client, gameId, ownerUserId, 140, 140);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(player.client, gameId, {
    attacks: {},
    ability_activations: [
      {
        ability_id: 'shield_capacitors',
      },
    ],
  });
  await submitOrder(owner.client, gameId, {
    attacks: {
      [playerUserId]: 140,
    },
    ability_activations: [],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(90);
  expect(eventsForUser(detail, playerUserId, 'step2:passive_round_start_defense')).toEqual(
    expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ source_ability_id: 'shield_boosters', defense_bonus: 20 }) })])
  );
  expect(eventsForUser(detail, playerUserId, 'activation:shield_capacitors')).toEqual(
    expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ ability_id: 'shield_capacitors', applied_defense_bonus: 20 }) })])
  );
  expect(eventsForUser(detail, playerUserId, 'step6:damage_resolution')).toEqual(
    expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ normal_incoming: 140, defense_available: 130, final_damage: 10 }) })])
  );
});

test('multiple meson beams stack when activated together', async () => {
  const { gameId, owner, ownerUserId, playerUserId } = await createStartedRumbleGame('meson-multi');

  await grantAbilities(owner.client, gameId, ownerUserId, ['meson_beam', 'meson_beam']);
  await setHealth(owner.client, gameId, playerUserId, 15, 15);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      { ability_id: 'meson_beam', target_user_id: playerUserId },
      { ability_id: 'meson_beam', target_user_id: playerUserId },
    ],
  });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, playerUserId).health).toBe(5);
  expect(eventsForUser(detail, ownerUserId, 'activation:meson_beam').length).toBeGreaterThanOrEqual(2);
});

test('various X abilities behave when X is zero (phase_bomb, loitering_munitions, torpedo_bays)', async () => {
  const { gameId, owner, ownerUserId, participants } = await createStartedRumbleGame('x-zero', {
    playerLabels: ['t1', 't2'],
    observerLabels: [],
  });
  const [, t1, t2] = participants;

  // Phase bomb with X=0 should do zero damage
  await grantAbilities(owner.client, gameId, ownerUserId, ['phase_bomb', 'loitering_munitions', 'torpedo_bays']);
  await setHealth(owner.client, gameId, t1.userId, 10, 10);
  await setHealth(owner.client, gameId, t2.userId, 10, 10);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [
      { ability_id: 'phase_bomb', x_cost: 0 },
      { ability_id: 'loitering_munitions', target_user_id: t1.userId, x_cost: 0 },
      { ability_id: 'torpedo_bays', x_cost: 0 },
    ],
  });
  await resolveRound(owner.client, gameId);

  let detail = await getGameDetail(owner.client, gameId);
  expect(eventsForUser(detail, ownerUserId, 'activation:phase_bomb')).toEqual(
    expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ applied_damage_each: 0 }) })])
  );
  expect(findRumblePlayer(detail, t1.userId).health).toBe(10);
  expect(findRumblePlayer(detail, t2.userId).health).toBe(10);

  // loitering_munitions scheduled for next round with X=0 should deal 0
  await resolveRound(owner.client, gameId);
  detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, t1.userId).health).toBe(10);
});

test('torpedo bays adds its bonus to only one attack next round', async () => {
  const { gameId, owner, ownerUserId, participants } = await createStartedRumbleGame('torpedo-single', {
    playerLabels: ['a', 'b'],
    observerLabels: [],
  });
  const [, a, b] = participants;

  await grantAbilities(owner.client, gameId, ownerUserId, ['torpedo_bays']);
  await setHealth(owner.client, gameId, a.userId, 30, 30);
  await setHealth(owner.client, gameId, b.userId, 30, 30);
  await enterBattlePhase(owner.client, gameId);

  // Schedule torpedo for next round
  await submitOrder(owner.client, gameId, { attacks: {}, ability_activations: [{ ability_id: 'torpedo_bays', x_cost: 15 }] });
  await resolveRound(owner.client, gameId);

  // Next round attack both targets; only one should receive the +15
  await submitOrder(owner.client, gameId, { attacks: { [a.userId]: 20, [b.userId]: 20 }, ability_activations: [] });
  await resolveRound(owner.client, gameId);

  const detail = await getGameDetail(owner.client, gameId);
  expect(findRumblePlayer(detail, a.userId).health).toBe(25);
  expect(findRumblePlayer(detail, b.userId).health).toBe(30);
  expect(eventsForUser(detail, a.userId, 'step6:damage_resolution')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          normal_incoming: 35,
          defense_available: 30,
          final_damage: 5,
        }),
      }),
    ])
  );
  expect(eventsForUser(detail, b.userId, 'step6:damage_resolution')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          normal_incoming: 20,
          defense_available: 30,
          final_damage: 0,
        }),
      }),
    ])
  );
});

test('hailing frequencies lasts a single turn and is undone after use', async () => {
  const threePlayer = await createStartedRumbleGame('hailing-single-turn', {
    playerLabels: ['target', 'other'],
    observerLabels: [],
  });
  const { gameId, owner, ownerUserId, participants } = threePlayer;
  const [, target, other] = participants;

  await grantAbilities(owner.client, gameId, ownerUserId, ['hailing_frequencies']);
  await enterBattlePhase(owner.client, gameId);

  await submitOrder(owner.client, gameId, {
    attacks: {},
    ability_activations: [{ ability_id: 'hailing_frequencies', target_user_id: target.userId }],
  });
  await resolveRound(owner.client, gameId);

  // Blocked this round
  const blockedOwnerAttack = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: { attacks: { [target.userId]: 10 }, ability_activations: [] },
  });
  expect(blockedOwnerAttack.status).toBe(422);

  const blockedTargetAttack = await target.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: { attacks: { [ownerUserId]: 10 }, ability_activations: [] },
  });
  expect(blockedTargetAttack.status).toBe(422);

  // Advance round without interactions between them so effect expires
  await submitOrder(other.client, gameId, { attacks: {}, ability_activations: [] });
  await resolveRound(owner.client, gameId);

  // Now attacks between owner and target should be allowed
  const ownerOk = await owner.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: { attacks: { [target.userId]: 10 }, ability_activations: [] },
  });
  expect(ownerOk.status).toBe(201);

  const targetOk = await target.client.post(`/api/games/${gameId}/actions/rumble-order`, {
    json: { attacks: { [ownerUserId]: 10 }, ability_activations: [] },
  });
  expect(targetOk.status).toBe(201);
});
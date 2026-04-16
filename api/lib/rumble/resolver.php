<?php

// Resolver engine for Rumble (bidding/round resolution)

function rumble_action_resolve_bidding_and_enter_battle(int $gameId, int $roundNumber): int
{
	$pdo = db();

	$ensureStmt = $pdo->prepare(db_upsert_sql(
		'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health) '
		. 'SELECT gm.game_id, gm.user_id, 100, 100 FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1',
		['game_id', 'user_id'],
		[
			'current_health' => 'current_health',
			'starting_health' => 'starting_health',
		]
	));
	$ensureStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);

	$offer = rumble_action_current_offer($gameId, $roundNumber);
	if ($offer === null || empty($offer['items'])) {
		error_response('No ability offer is available for this game.', 409);
	}

	$playersStmt = $pdo->prepare(
		'SELECT gm.user_id, COALESCE(rps.current_health, 100) AS current_health, rps.owned_abilities_json '
		. 'FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
		. 'AND COALESCE(rps.current_health, 100) > 0'
	);
	$playersStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);
	$playerRows = $playersStmt->fetchAll();

	$remainingHealth = [];
	$healthBeforeByUserId = [];
	$ownedByUser = [];
	foreach ($playerRows as $row) {
		$userId = (int)$row['user_id'];
		$remainingHealth[$userId] = (int)$row['current_health'];
		$healthBeforeByUserId[$userId] = (int)$row['current_health'];
		$ownedByUser[$userId] = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
	}

	if (empty($remainingHealth)) {
		return 0;
	}

	$bidStmt = $pdo->prepare(
		'SELECT user_id, payload FROM game_actions '
		. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
	);
	$bidStmt->execute([
		'game_id' => $gameId,
		'round_number' => $roundNumber,
		'action_type' => 'bid',
	]);
	$bidRows = $bidStmt->fetchAll();

	$offerItems = (array)($offer['items'] ?? []);
	$bidsByOfferItem = [];
	foreach ($offerItems as $offerItem) {
		$offerItemKey = trim((string)($offerItem['offer_item_key'] ?? ''));
		if ($offerItemKey === '') {
			continue;
		}
		$bidsByOfferItem[$offerItemKey] = [];
	}

	foreach ($bidRows as $row) {
		$userId = (int)$row['user_id'];
		if (!isset($remainingHealth[$userId])) {
			continue;
		}

		$payload = json_decode((string)$row['payload'], true);
		if (!is_array($payload)) {
			continue;
		}

		$bids = rumble_normalize_bid_map(isset($payload['bids']) ? $payload['bids'] : [], $offerItems);
		foreach ($bids as $offerItemKey => $amount) {
			if (!isset($bidsByOfferItem[$offerItemKey])) {
				continue;
			}
			$bidsByOfferItem[$offerItemKey][$userId] = (int)$amount;
		}
	}

	$assigned = [];
	foreach ($offerItems as $offerItem) {
		$offerItemKey = trim((string)($offerItem['offer_item_key'] ?? ''));
		$abilityId = trim((string)($offerItem['ability_id'] ?? ''));
		if ($offerItemKey === '' || $abilityId === '') {
			continue;
		}

		$abilityBids = $bidsByOfferItem[$offerItemKey] ?? [];
		if (empty($abilityBids)) {
			continue;
		}

		$bidLevels = array_values(array_unique(array_map(static fn ($v): int => (int)$v, array_values($abilityBids))));
		rsort($bidLevels, SORT_NUMERIC);
		$winningBid = 0;
		$candidateIds = [];
		foreach ($bidLevels as $bidLevel) {
			if ($bidLevel <= 0) {
				continue;
			}

			$eligibleAtLevel = [];
			foreach ($abilityBids as $userId => $bidAmount) {
				if ((int)$bidAmount !== (int)$bidLevel) {
					continue;
				}
				$eligibleAtLevel[] = (int)$userId;
			}

			if (empty($eligibleAtLevel)) {
				continue;
			}

			$winningBid = (int)$bidLevel;
			$candidateIds = $eligibleAtLevel;
			break;
		}

		if ($winningBid <= 0 || empty($candidateIds)) {
			continue;
		}

		$winnerId = $candidateIds[count($candidateIds) === 1 ? 0 : random_int(0, count($candidateIds) - 1)];
		$remainingHealth[$winnerId] = $remainingHealth[$winnerId] - $winningBid;
		$ownedByUser[$winnerId][] = $abilityId;
		$assigned[] = [
			'offer_item_key' => $offerItemKey,
			'ability_id' => $abilityId,
			'user_id' => $winnerId,
			'bid' => $winningBid,
		];
	}

	$pdo->beginTransaction();
	try {
		$updateStateStmt = $pdo->prepare(db_upsert_sql(
			'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round)',
			['game_id'],
			[
				'phase' => ':phase_update',
			]
		));
		$updateStateStmt->execute([
			'game_id' => $gameId,
			'phase' => 'battle',
			'current_round' => $roundNumber,
			'phase_update' => 'battle',
		]);

		$updatePlayerStmt = $pdo->prepare(
			'UPDATE rumble_player_state SET current_health = :current_health, owned_abilities_json = :owned_abilities_json '
			. 'WHERE game_id = :game_id AND user_id = :user_id'
		);
		$defeatedUserIds = [];
		foreach ($remainingHealth as $userId => $health) {
			$updatePlayerStmt->execute([
				'current_health' => (int)$health,
				'owned_abilities_json' => rumble_encode_owned_abilities($ownedByUser[$userId] ?? []),
				'game_id' => $gameId,
				'user_id' => $userId,
			]);

			if ((int)$health <= 0) {
				$defeatedUserIds[] = (int)$userId;
			}
		}

		if (!empty($defeatedUserIds)) {
			$rolePlaceholders = implode(',', array_fill(0, count($defeatedUserIds), '?'));
			$defeatRoleSql = 'UPDATE game_members SET role = ? WHERE game_id = ? AND user_id IN (' . $rolePlaceholders . ') AND role <> ?';
			$defeatRoleParams = array_merge(['observer', $gameId], $defeatedUserIds, ['observer']);
			$defeatRoleStmt = $pdo->prepare($defeatRoleSql);
			$defeatRoleStmt->execute($defeatRoleParams);
		}

		rumble_record_eliminations($pdo, $gameId, $roundNumber, $healthBeforeByUserId, $defeatedUserIds);

		$deleteAssignmentStmt = $pdo->prepare(
			'DELETE FROM game_actions WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
		);
		$deleteAssignmentStmt->execute([
			'game_id' => $gameId,
			'round_number' => $roundNumber,
			'action_type' => 'ability_assignment',
		]);

		$insertAssignmentStmt = $pdo->prepare(
			'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
			. 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
		);
		$assignmentActorId = (int)array_key_first($remainingHealth);
		$insertAssignmentStmt->execute([
			'game_id' => $gameId,
			'user_id' => $assignmentActorId,
			'action_type' => 'ability_assignment',
			'payload' => json_encode(['assigned' => $assigned], JSON_UNESCAPED_UNICODE),
			'round_number' => $roundNumber,
			'phase' => 'bidding',
			'revealed_at' => gmdate('Y-m-d H:i:s'),
		]);

		rumble_finalize_standings_if_won($pdo, $gameId, $roundNumber);

		$pdo->commit();
	} catch (Throwable $ex) {
		$pdo->rollBack();
		throw $ex;
	}

	return count($assigned);
}

function rumble_action_resolve_round_and_advance(int $gameId, int $roundNumber): int
{
	$pdo = db();

	$ensureStmt = $pdo->prepare(db_upsert_sql(
		'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health) '
		. 'SELECT gm.game_id, gm.user_id, 100, 100 FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1',
		['game_id', 'user_id'],
		[
			'current_health' => 'current_health',
			'starting_health' => 'starting_health',
		]
	));
	$ensureStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);

	$playersStmt = $pdo->prepare(
		'SELECT rps.user_id, rps.current_health, rps.starting_health, rps.owned_abilities_json FROM rumble_player_state rps '
		. 'JOIN game_members gm ON gm.game_id = rps.game_id AND gm.user_id = rps.user_id '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'WHERE rps.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
	);
	$playersStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);
	$playerRows = $playersStmt->fetchAll();
	if (empty($playerRows)) {
		return 0;
	}

	$pendingRoundStartEffects = rumble_fetch_round_start_effects($gameId, $roundNumber);
	$roundStartEnergyBonusByUser = [];
	foreach ($pendingRoundStartEffects as $effectRow) {
		$ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
		if ($ownerUserId <= 0) {
			continue;
		}

		$payload = json_decode((string)($effectRow['payload'] ?? '{}'), true);
		if (!is_array($payload)) {
			continue;
		}
		if ((string)($payload['effect_kind'] ?? '') !== 'energy_bonus') {
			continue;
		}

		$roundStartEnergyBonusByUser[$ownerUserId] = max(0, (int)($roundStartEnergyBonusByUser[$ownerUserId] ?? 0)) + max(0, (int)($payload['energy_bonus'] ?? 0));
	}

	$healthByUser = [];
	$healthBeforeByUser = [];
	$ownedAbilityIdsByUser = [];
	$ownedAbilitySetByUser = [];
	$energyBudgetByUser = [];
	$roundStartDefenseBonusByUser = [];
	$activatedDefenseBonusByUser = [];
	$untargetableByUser = [];
	$cannotAttackByUser = [];
	$blockedAttackTargetsByUser = [];
	$armorReductionByUser = [];
	$outgoingAttackBonusByUser = [];
	$nimbleDodgeByUser = [];
	$focusedDefenseByUser = [];
	$reflectiveDamageRatioByUser = [];
	$roundEndUpkeepRulesByUser = [];
	$preRoundEffectRows = [];

	foreach ($playerRows as $row) {
		$userId = (int)$row['user_id'];
		$health = max(0, (int)$row['current_health']);
		$ownedAbilityIds = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
		$abilitySet = array_fill_keys($ownedAbilityIds, true);

		foreach (array_keys($abilitySet) as $ownedAbilityId) {
			$ability = rumble_ability_by_id($ownedAbilityId);
			if ($ability === null) {
				continue;
			}

			$params = rumble_ability_template_params($ability);
			$configuredHeal = null;
			$capToStarting = null;

			if (array_key_exists('heal_amount', $params)) {
				$configuredHeal = max(0, (int)$params['heal_amount']);
				$capToStarting = array_key_exists('cap_to_starting', $params) ? (bool)$params['cap_to_starting'] : null;
			}

			if ($configuredHeal === null) {
				$contract = rumble_ability_runtime_contract($ability);
				foreach ((array)($contract['conditions'] ?? []) as $condition) {
					if ((string)($condition['evaluation_timing'] ?? '') !== 'round_start') {
						continue;
					}
					$roundRule = is_array($condition['round_rule'] ?? null) ? (array)$condition['round_rule'] : [];
					$matchesRound = true;
					if ((string)($roundRule['kind'] ?? '') === 'exact_round') {
						$matchesRound = ((int)($roundRule['round_number'] ?? 0) === $roundNumber);
					}
					if (!$matchesRound) {
						continue;
					}
					foreach ((array)($condition['outcomes'] ?? []) as $outcome) {
						if (!is_array($outcome)) {
							continue;
						}
						if ((string)($outcome['kind'] ?? '') === 'heal_constant') {
							$formula = is_array($outcome['formula'] ?? null) ? (array)$outcome['formula'] : [];
							$value = max(0, (int)($formula['value'] ?? 0));
							if ($value > 0) {
								$configuredHeal = $value;
								$capToStarting = $capToStarting ?? false;
								break 2;
							}
						}
					}
				}
			}

			if ($configuredHeal === null || $configuredHeal <= 0) {
				continue;
			}

			$applied = 0;
			if ($capToStarting === null) {
				$capToStarting = false;
			}

			if ($capToStarting) {
				$startingHealth = max(0, (int)($row['starting_health'] ?? 100));
				if ($health < $startingHealth) {
					$applied = min($configuredHeal, $startingHealth - $health);
					$health += $applied;
				}
			} else {
				$applied = $configuredHeal;
				$health += $applied;
			}

			if ($applied > 0) {
				$preRoundEffectRows[] = [
					'game_id' => $gameId,
					'round_number' => $roundNumber,
					'owner_user_id' => $userId,
					'target_user_id' => null,
					'ability_instance_id' => null,
					'effect_key' => 'step2:passive_round_start_heal',
					'trigger_timing' => 'resolve',
					'payload' => ['source_ability_id' => $ownedAbilityId, 'amount' => $applied],
					'is_resolved' => 1,
					'resolved_at' => gmdate('Y-m-d H:i:s'),
				];
			}
		}

		$healthByUser[$userId] = $health;
		$healthBeforeByUser[$userId] = $health;
		$ownedAbilityIdsByUser[$userId] = $ownedAbilityIds;
		$ownedAbilitySetByUser[$userId] = $abilitySet;
		$energyBudgetByUser[$userId] = rumble_player_round_energy_budget($health, $ownedAbilityIds);

		$roundStartDefenseBonusByUser[$userId] = 0;
		$activatedDefenseBonusByUser[$userId] = 0;
		$untargetableByUser[$userId] = false;
		$outgoingAttackBonusByUser[$userId] = 0;
		$reflectiveDamageRatioByUser[$userId] = 0.0;
		$roundEndUpkeepRulesByUser[$userId] = [];
		foreach ($ownedAbilityIds as $ownedAbilityId) {
			$ownedAbility = rumble_ability_by_id($ownedAbilityId);
			if ($ownedAbility === null) {
				continue;
			}
			$roundStartDefenseBonus = (int)floor(rumble_ability_modifier_sum($ownedAbility, 'defense', 'add', 'round_start'));
			if ($roundStartDefenseBonus > 0) {
				$roundStartDefenseBonusByUser[$userId] += $roundStartDefenseBonus;
				$preRoundEffectRows[] = [
					'game_id' => $gameId,
					'round_number' => $roundNumber,
					'owner_user_id' => $userId,
					'target_user_id' => null,
					'ability_instance_id' => null,
					'effect_key' => 'step2:passive_round_start_defense',
					'trigger_timing' => 'resolve',
					'payload' => ['source_ability_id' => $ownedAbilityId, 'defense_bonus' => $roundStartDefenseBonus],
					'is_resolved' => 1,
					'resolved_at' => gmdate('Y-m-d H:i:s'),
				];
			}

			foreach (rumble_ability_state_grants($ownedAbility, 'always') as $state) {
				rumble_apply_runtime_state_to_targeting_maps($state, $userId, null, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser);
			}

			$outgoingAttackBonusByUser[$userId] += (int)floor(rumble_ability_modifier_sum($ownedAbility, 'outgoing_attack_damage', 'add', 'attack'));
			$reflectiveDamageRatioByUser[$userId] += rumble_ability_modifier_sum($ownedAbility, 'retaliation_damage_ratio', 'add', 'on_damage_taken');

			$roundEndUpkeepLoss = (int)floor(rumble_ability_modifier_sum($ownedAbility, 'health', 'subtract', 'round_end'));
			if ($roundEndUpkeepLoss > 0) {
				$roundEndUpkeepRulesByUser[$userId][] = [
					'source_ability_id' => $ownedAbilityId,
					'health_loss' => $roundEndUpkeepLoss,
				];
			}
		}
		$armorReduction = 0;
		foreach ($ownedAbilityIds as $ownedAbilityId) {
			$ownedAbility = rumble_ability_by_id($ownedAbilityId);
			if ($ownedAbility === null) {
				continue;
			}
			$armorReduction += (int)floor(rumble_ability_modifier_sum($ownedAbility, 'incoming_attack_damage', 'reduce_each_instance', 'incoming_attack'));
		}
		$armorReductionByUser[$userId] = max(0, (int)$armorReduction);
		$nimbleDodgeByUser[$userId] = false;
		$focusedDefenseByUser[$userId] = [];
		$energyBudgetByUser[$userId] += max(0, (int)($roundStartEnergyBonusByUser[$userId] ?? 0));

		$preRoundEffectRows[] = [
			'game_id' => $gameId,
			'round_number' => $roundNumber,
			'owner_user_id' => $userId,
			'target_user_id' => null,
			'ability_instance_id' => null,
			'effect_key' => 'step1:set_round_stats',
			'trigger_timing' => 'resolve',
			'payload' => ['health' => $health, 'energy_budget' => $energyBudgetByUser[$userId]],
			'is_resolved' => 1,
			'resolved_at' => gmdate('Y-m-d H:i:s'),
		];

	}

	$roundEffectRows = $preRoundEffectRows;

	$roundTargetingState = rumble_collect_round_targeting_state($playerRows, $pendingRoundStartEffects);
	$untargetableByUser = array_replace($untargetableByUser, (array)($roundTargetingState['untargetable_by_user'] ?? []));
	$cannotAttackByUser = array_replace(array_fill_keys(array_keys($healthByUser), false), (array)($roundTargetingState['cannot_attack_by_user'] ?? []));
	$blockedAttackTargetsByUser = array_replace(array_fill_keys(array_keys($healthByUser), []), (array)($roundTargetingState['blocked_attack_targets_by_user'] ?? []));
	$activePersistentRoundStartEffectsByUser = [];
	$scheduledNormalIncomingByTargetByAttacker = [];
	$scheduledUnblockableIncomingByTargetByAttacker = [];
	$scheduledDefenseOnlyIncomingByTargetByAttacker = [];
	$scheduledAttackBonusByUser = [];
	$roundStartEffectIdsToResolve = [];
	foreach ($pendingRoundStartEffects as $effectRow) {
		$effectId = (int)($effectRow['id'] ?? 0);
		$ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
		$targetUserId = isset($effectRow['target_user_id']) && $effectRow['target_user_id'] !== null ? (int)$effectRow['target_user_id'] : null;
		if ($effectId <= 0 || !isset($healthByUser[$ownerUserId])) {
			continue;
		}

		$payload = json_decode((string)($effectRow['payload'] ?? '{}'), true);
		if (!is_array($payload)) {
			$payload = [];
		}

		if ((string)($payload['effect_kind'] ?? '') === 'energy_bonus') {
			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber,
				'owner_user_id' => $ownerUserId,
				'target_user_id' => $targetUserId,
				'ability_instance_id' => null,
				'effect_key' => 'step2:scheduled_energy_bonus',
				'trigger_timing' => 'resolve',
				'payload' => [
					'source_ability_id' => (string)($payload['source_ability_id'] ?? ''),
					'energy_bonus' => max(0, (int)($payload['energy_bonus'] ?? 0)),
				],
				'is_resolved' => 1,
				'resolved_at' => gmdate('Y-m-d H:i:s'),
			];
			$roundStartEffectIdsToResolve[] = $effectId;
			continue;
		}

		if ((string)($payload['effect_kind'] ?? '') === 'delayed_attack') {
			$damage = max(0, (int)($payload['damage'] ?? 0));
			$channel = (string)($payload['channel'] ?? 'normal');
			if ($targetUserId !== null && $targetUserId > 0 && $damage > 0 && isset($healthByUser[$targetUserId])) {
				if ($channel === 'unblockable') {
					$scheduledUnblockableIncomingByTargetByAttacker[$targetUserId][$ownerUserId] = max(0, (int)($scheduledUnblockableIncomingByTargetByAttacker[$targetUserId][$ownerUserId] ?? 0)) + $damage;
				} elseif ($channel === 'defense_only') {
					$scheduledDefenseOnlyIncomingByTargetByAttacker[$targetUserId][$ownerUserId] = max(0, (int)($scheduledDefenseOnlyIncomingByTargetByAttacker[$targetUserId][$ownerUserId] ?? 0)) + $damage;
				} else {
					$scheduledNormalIncomingByTargetByAttacker[$targetUserId][$ownerUserId] = max(0, (int)($scheduledNormalIncomingByTargetByAttacker[$targetUserId][$ownerUserId] ?? 0)) + $damage;
				}
			}
			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber,
				'owner_user_id' => $ownerUserId,
				'target_user_id' => $targetUserId,
				'ability_instance_id' => null,
				'effect_key' => 'step2:scheduled_attack',
				'trigger_timing' => 'resolve',
				'payload' => [
					'source_ability_id' => (string)($payload['source_ability_id'] ?? ''),
					'damage' => $damage,
					'channel' => $channel,
				],
				'is_resolved' => 1,
				'resolved_at' => gmdate('Y-m-d H:i:s'),
			];
			$roundStartEffectIdsToResolve[] = $effectId;
			continue;
		}

		if ((string)($payload['effect_kind'] ?? '') === 'attack_bonus') {
			$bonusDamage = max(0, (int)($payload['bonus_damage'] ?? 0));
			$scheduledAttackBonusByUser[$ownerUserId] = max(0, (int)($scheduledAttackBonusByUser[$ownerUserId] ?? 0)) + $bonusDamage;
			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber,
				'owner_user_id' => $ownerUserId,
				'target_user_id' => null,
				'ability_instance_id' => null,
				'effect_key' => 'step2:scheduled_attack_bonus',
				'trigger_timing' => 'resolve',
				'payload' => [
					'source_ability_id' => (string)($payload['source_ability_id'] ?? ''),
					'bonus_damage' => $bonusDamage,
				],
				'is_resolved' => 1,
				'resolved_at' => gmdate('Y-m-d H:i:s'),
			];
			$roundStartEffectIdsToResolve[] = $effectId;
			continue;
		}

		$scheduledState = rumble_runtime_state_from_payload($payload, $ownerUserId, $targetUserId);
		if ($scheduledState !== null) {
			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber,
				'owner_user_id' => $ownerUserId,
				'target_user_id' => $targetUserId,
				'ability_instance_id' => null,
				'effect_key' => 'step2:scheduled_status',
				'trigger_timing' => 'resolve',
				'payload' => ['effect' => (string)($payload['effect'] ?? ''), 'state' => $scheduledState],
				'is_resolved' => 1,
				'resolved_at' => gmdate('Y-m-d H:i:s'),
			];

			$duration = is_array($scheduledState['duration'] ?? null) ? (array)$scheduledState['duration'] : [];
			$sourceAbilityId = rumble_canonical_ability_id((string)($payload['source_ability_id'] ?? ''));
			if ((string)($duration['kind'] ?? '') === 'until_removed' && $sourceAbilityId !== '') {
				$activePersistentRoundStartEffectsByUser[$ownerUserId][$sourceAbilityId] = [
					'target_user_id' => $targetUserId,
					'effect_key' => (string)($effectRow['effect_key'] ?? ''),
					'payload' => $payload,
				];
			}
		}

		$roundStartEffectIdsToResolve[] = $effectId;
	}

	$ordersStmt = $pdo->prepare(
		'SELECT user_id, payload FROM game_actions '
		. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
	);
	$ordersStmt->execute([
		'game_id' => $gameId,
		'round_number' => $roundNumber,
		'action_type' => 'order',
	]);
	$orderRows = $ordersStmt->fetchAll();
	usort($orderRows, static function (array $a, array $b): int {
		return ((int)($a['user_id'] ?? 0)) <=> ((int)($b['user_id'] ?? 0));
	});

	$normalIncomingByTargetByAttacker = [];
	$unblockableIncomingByTargetByAttacker = [];
	$defenseOnlyIncomingByTargetByAttacker = [];
	$defenseByUser = [];
	$abilityEnergySpentByUser = [];
	$attackEnergySpentByUser = [];
	$totalEnergySpentByUser = [];
	$roundStartAttackBonusByUser = [];

	foreach ($healthByUser as $userId => $health) {
		$normalIncomingByTargetByAttacker[$userId] = [];
		$unblockableIncomingByTargetByAttacker[$userId] = [];
		$defenseOnlyIncomingByTargetByAttacker[$userId] = [];
		$defenseByUser[$userId] = max(0, $health + (int)($roundStartDefenseBonusByUser[$userId] ?? 0));
		$abilityEnergySpentByUser[$userId] = 0;
		$attackEnergySpentByUser[$userId] = 0;
		$totalEnergySpentByUser[$userId] = 0;
		$roundStartAttackBonusByUser[$userId] = 0;
		foreach ((array)($scheduledNormalIncomingByTargetByAttacker[$userId] ?? []) as $attackerId => $amount) {
			$normalIncomingByTargetByAttacker[$userId][(int)$attackerId] = max(0, (int)$amount);
		}
		foreach ((array)($scheduledUnblockableIncomingByTargetByAttacker[$userId] ?? []) as $attackerId => $amount) {
			$unblockableIncomingByTargetByAttacker[$userId][(int)$attackerId] = max(0, (int)$amount);
		}
		foreach ((array)($scheduledDefenseOnlyIncomingByTargetByAttacker[$userId] ?? []) as $attackerId => $amount) {
			$defenseOnlyIncomingByTargetByAttacker[$userId][(int)$attackerId] = max(0, (int)$amount);
		}
		$roundStartAttackBonusByUser[$userId] = max(0, (int)($scheduledAttackBonusByUser[$userId] ?? 0));
	}

	$activationHealthLossByUser = [];
	$activationHealingByUser = [];
	$efficientTargetingByUser = [];
	$mineLayerDamageByUser = [];
	$schemingTargetByUser = [];
	$retaliationDamageByUser = [];
	$toggleActivatedByUser = [];
	$blockedDamageEnergyBonusRulesByUser = [];
	$preparedAttacksByUser = [];
	$ownedMapByUser = [];
	$remainingAttackEnergyByUser = [];
	$energyBudgetForOrderByUser = [];
	foreach ($healthByUser as $userId => $health) {
		$retaliationDamageByUser[$userId] = 0;
		$toggleActivatedByUser[$userId] = [];
		$blockedDamageEnergyBonusRulesByUser[$userId] = [];
		$preparedAttacksByUser[$userId] = [];
		$ownedMapByUser[$userId] = array_fill_keys($ownedAbilityIdsByUser[$userId] ?? [], true);
		$remainingAttackEnergyByUser[$userId] = max(0, (int)($energyBudgetByUser[$userId] ?? 0));
		$energyBudgetForOrderByUser[$userId] = max(0, (int)($energyBudgetByUser[$userId] ?? 0));
	}

	foreach ($orderRows as $row) {
		$userId = (int)$row['user_id'];
		if (!isset($healthByUser[$userId])) {
			continue;
		}

		$health = $healthByUser[$userId];
		if ($health <= 0) {
			continue;
		}

		$payload = json_decode((string)$row['payload'], true);
		if (!is_array($payload)) {
			continue;
		}

		$attacks = isset($payload['attacks']) && is_array($payload['attacks']) ? $payload['attacks'] : [];
		$activations = rumble_normalize_ability_activations($payload['ability_activations'] ?? []);
		$preparedAttacksByUser[$userId] = $attacks;

		$ownedMap = array_fill_keys($ownedAbilityIdsByUser[$userId] ?? [], true);
		$ownedMapByUser[$userId] = $ownedMap;
		$energyBudget = max(0, (int)($energyBudgetByUser[$userId] ?? 0));
		$energyBudgetForOrderByUser[$userId] = $energyBudget;
		$remainingEnergy = $energyBudget;

		foreach ($activations as $activation) {
			$abilityId = (string)($activation['ability_id'] ?? '');
			if ($abilityId === '' || !isset($ownedMap[$abilityId])) {
				continue;
			}

			try {
				$activationCost = rumble_activation_energy_cost($activation, true);
			} catch (InvalidArgumentException $ex) {
				continue;
			}

			if ($activationCost > $remainingEnergy) {
				continue;
			}

			$ability = rumble_ability_by_id($abilityId);
			if ($ability === null) {
				continue;
			}

			$targetId = array_key_exists('target_user_id', $activation) ? (int)$activation['target_user_id'] : 0;
			if ($targetId > 0 && (!isset($healthByUser[$targetId]) || $targetId === $userId || $healthByUser[$targetId] <= 0)) {
				continue;
			}
			if ($targetId > 0 && !empty($untargetableByUser[$targetId])) {
				continue;
			}

			$remainingEnergy -= $activationCost;
			$abilityEnergySpentByUser[$userId] += $activationCost;

			$templateKey = rumble_ability_template_key($ability);
			$templateParams = rumble_ability_template_params($ability);
			$runtimeContract = rumble_ability_runtime_contract($ability);
			$activationContract = is_array($runtimeContract['activation'] ?? null) ? (array)$runtimeContract['activation'] : [];
			$effectPayload = ['ability_id' => $abilityId, 'activation' => $activation, 'cost' => $activationCost];
			$healthBurn = max(0, (int)($templateParams['health_burn'] ?? 0));
			if ($activationContract !== []) {
				foreach ((array)($activationContract['costs'] ?? []) as $cost) {
					if (!is_array($cost) || (string)($cost['resource'] ?? '') !== 'health') {
						continue;
					}
					$formula = is_array($cost['formula'] ?? null) ? (array)$cost['formula'] : [];
					$value = rumble_runtime_formula_value($formula, $activation);
					if ($value !== null) {
						$healthBurn += max(0, (int)floor($value));
					}
				}
			}
			if ($healthBurn > 0) {
				$activationHealthLossByUser[$userId] = max(0, (int)($activationHealthLossByUser[$userId] ?? 0)) + $healthBurn;
				$effectPayload['health_burn'] = $healthBurn;
			}

			if ($activationContract !== []) {
				$activationKind = trim((string)($activationContract['kind'] ?? 'activated'));
				$isActiveToggle = !empty($activePersistentRoundStartEffectsByUser[$userId][$abilityId]);
				if ($activationKind === 'toggle') {
					$toggleActivatedByUser[$userId][$abilityId] = true;
					$effectPayload['mode'] = $isActiveToggle ? 'deactivate' : 'activate';
				}

				foreach ((array)($activationContract['effects'] ?? []) as $effect) {
					if (!is_array($effect)) {
						continue;
					}
					rumble_apply_runtime_activation_effect($effect, $userId, $targetId > 0 ? $targetId : null, $abilityId, $activation, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser, $nimbleDodgeByUser, $focusedDefenseByUser, $activatedDefenseBonusByUser, $mineLayerDamageByUser, $schemingTargetByUser, $blockedDamageEnergyBonusRulesByUser, $effectPayload);
				}

				if (!$isActiveToggle) {
					$scheduledAny = false;
					foreach ((array)($activationContract['scheduled_effects'] ?? []) as $effect) {
						if (!is_array($effect)) {
							continue;
						}
						$scheduledAny = rumble_append_runtime_scheduled_effect($effect, $gameId, $roundNumber, $userId, $targetId > 0 ? $targetId : null, $abilityId, $roundEffectRows) || $scheduledAny;
					}
					if ($scheduledAny) {
						$effectPayload['scheduled_for_round'] = $roundNumber + 1;
					}
				}
			} elseif ($templateKey === 'activated_spend_with_target_policy') {
				$effectFormula = (array)($templateParams['effect_formula'] ?? []);
				$effectKind = (string)($effectFormula['kind'] ?? '');
				if ($effectKind === 'damage_constant' && $targetId > 0) {
					$damage = max(0, (int)($effectFormula['value'] ?? 0));
					$channel = (string)($effectFormula['channel'] ?? 'normal');
					if ($channel === 'unblockable') {
						$unblockableIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($unblockableIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $damage;
					} elseif ($channel === 'defense_only') {
						$defenseOnlyIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($defenseOnlyIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $damage;
					} else {
						$normalIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($normalIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $damage;
					}
					$effectPayload['applied_damage'] = $damage;
					$effectPayload['channel'] = $channel;
				} elseif ($effectKind === 'damage_floor_half_x') {
					$x = max(0, (int)($activation['x_cost'] ?? 0));
					$damage = (int)floor($x / 2);
					if ($damage > 0) {
						foreach ($healthByUser as $candidateId => $candidateHealth) {
							if ($candidateId === $userId || $candidateHealth <= 0) {
								continue;
							}
							if (!empty($untargetableByUser[$candidateId])) {
								continue;
							}
							$normalIncomingByTargetByAttacker[$candidateId][$userId] = max(0, (int)($normalIncomingByTargetByAttacker[$candidateId][$userId] ?? 0)) + $damage;
						}
					}
					$effectPayload['applied_damage_each'] = $damage;
				} elseif ($effectKind === 'next_round_damage_x' && $targetId > 0) {
					$damage = max(0, (int)($activation['x_cost'] ?? 0));
					$roundEffectRows[] = [
						'game_id' => $gameId,
						'round_number' => $roundNumber + 1,
						'owner_user_id' => $userId,
						'target_user_id' => $targetId,
						'ability_instance_id' => null,
						'effect_key' => 'status:delayed_attack',
						'trigger_timing' => 'round_start',
						'payload' => [
							'effect_kind' => 'delayed_attack',
							'source_ability_id' => $abilityId,
							'damage' => $damage,
							'channel' => 'normal',
						],
						'is_resolved' => 0,
						'resolved_at' => null,
					];
					$effectPayload['scheduled_for_round'] = $roundNumber + 1;
					$effectPayload['scheduled_damage'] = $damage;
				} elseif ($effectKind === 'next_round_bonus_attack_x') {
					$bonusDamage = max(0, (int)($activation['x_cost'] ?? 0));
					$roundEffectRows[] = [
						'game_id' => $gameId,
						'round_number' => $roundNumber + 1,
						'owner_user_id' => $userId,
						'target_user_id' => null,
						'ability_instance_id' => null,
						'effect_key' => 'status:attack_bonus',
						'trigger_timing' => 'round_start',
						'payload' => [
							'effect_kind' => 'attack_bonus',
							'source_ability_id' => $abilityId,
							'bonus_damage' => $bonusDamage,
						],
						'is_resolved' => 0,
						'resolved_at' => null,
					];
					$effectPayload['scheduled_for_round'] = $roundNumber + 1;
					$effectPayload['scheduled_bonus_damage'] = $bonusDamage;
				} elseif ($effectKind === 'heal_x') {
					$healing = max(0, (int)($activation['x_cost'] ?? 0));
					if ($healing > 0) {
						$activationHealingByUser[$userId] = max(0, (int)($activationHealingByUser[$userId] ?? 0)) + $healing;
						$effectPayload['healing'] = $healing;
					}
				} elseif ($effectKind === 'second_largest_attack_free') {
					$efficientTargetingByUser[$userId] = true;
					$effectPayload['enabled'] = true;
				}
			} elseif ($templateKey === 'activated_defense_mode') {
			}

			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber,
				'owner_user_id' => $userId,
				'target_user_id' => $targetId > 0 ? $targetId : null,
				'ability_instance_id' => null,
				'effect_key' => 'activation:' . $abilityId,
				'trigger_timing' => 'resolve',
				'payload' => $effectPayload,
				'is_resolved' => 1,
				'resolved_at' => gmdate('Y-m-d H:i:s'),
			];
		}

		$remainingAttackEnergyByUser[$userId] = max(0, $remainingEnergy);
	}

	foreach ($orderRows as $row) {
		$userId = (int)$row['user_id'];
		if (!isset($healthByUser[$userId])) {
			continue;
		}

		$health = $healthByUser[$userId];
		if ($health <= 0) {
			continue;
		}

		$attacks = isset($preparedAttacksByUser[$userId]) && is_array($preparedAttacksByUser[$userId]) ? $preparedAttacksByUser[$userId] : [];
		$ownedMap = isset($ownedMapByUser[$userId]) && is_array($ownedMapByUser[$userId]) ? $ownedMapByUser[$userId] : [];
		$energyBudget = max(0, (int)($energyBudgetForOrderByUser[$userId] ?? 0));
		$remainingEnergy = max(0, (int)($remainingAttackEnergyByUser[$userId] ?? 0));

		$defenseByUser[$userId] += max(0, (int)($activatedDefenseBonusByUser[$userId] ?? 0));

		$remaining = min($health, $remainingEnergy);
		$used = 0;
		$attackableTargetCount = 0;
		$positiveAttackSpends = [];
		$pendingAttackBonus = max(0, (int)($roundStartAttackBonusByUser[$userId] ?? 0));
		$orderedTargets = array_keys($attacks);
		sort($orderedTargets, SORT_NUMERIC);
		if (empty($cannotAttackByUser[$userId])) {
			foreach ($orderedTargets as $targetKey) {
				if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
					continue;
				}
				$targetId = (int)$targetKey;
				if (!isset($healthByUser[$targetId]) || $targetId === $userId || $healthByUser[$targetId] <= 0 || !empty($untargetableByUser[$targetId])) {
					continue;
				}
				if (!empty(($blockedAttackTargetsByUser[$userId] ?? [])[$targetId])) {
					continue;
				}
				$amountRaw = $attacks[$targetKey] ?? 0;
				if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
					continue;
				}
				if ((int)$amountRaw > 0) {
					$attackableTargetCount++;
					$positiveAttackSpends[] = (int)$amountRaw;
				}
			}
		}
		$singleAttackBonusApplies = isset($ownedMap['death_ray']) && $attackableTargetCount === 1;
		if (!empty($efficientTargetingByUser[$userId])) {
			rsort($positiveAttackSpends, SORT_NUMERIC);
			if (count($positiveAttackSpends) >= 2) {
				$remaining += max(0, (int)$positiveAttackSpends[1]);
			}
		}

		foreach ($orderedTargets as $targetKey) {
			if ($remaining <= 0) {
				break;
			}

			if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
				continue;
			}

			$targetId = (int)$targetKey;
			if (!isset($healthByUser[$targetId]) || $targetId === $userId) {
				continue;
			}
			if (!empty($untargetableByUser[$targetId])) {
				continue;
			}
			if (!empty($cannotAttackByUser[$userId]) || !empty(($blockedAttackTargetsByUser[$userId] ?? [])[$targetId])) {
				continue;
			}

			$amountRaw = $attacks[$targetKey] ?? 0;
			if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
				continue;
			}

			$amount = max(0, (int)$amountRaw);
			if ($amount === 0) {
				continue;
			}

			$spend = min($amount, $remaining);
			if ($spend <= 0) {
				continue;
			}

			$attackDamage = $spend;
			if ($pendingAttackBonus > 0) {
				$attackDamage += $pendingAttackBonus;
				$pendingAttackBonus = 0;
			}
			$attackDamage += max(0, (int)($outgoingAttackBonusByUser[$userId] ?? 0));
			if ($singleAttackBonusApplies) {
				$attackDamage = (int)floor($attackDamage * 1.5);
			}

			$incomingAttackMultiplier = (float)($focusedDefenseByUser[$targetId][$userId] ?? 1.0);
			if ($incomingAttackMultiplier > 0.0 && $incomingAttackMultiplier !== 1.0) {
				$attackDamage = (int)floor($attackDamage * $incomingAttackMultiplier);
			}

			if ($attackDamage > 0) {
				$normalIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($normalIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $attackDamage;
			}
			$used += $spend;
			$remaining -= $spend;
		}

		$attackEnergySpentByUser[$userId] = $used;
		$totalEnergySpentByUser[$userId] = $attackEnergySpentByUser[$userId] + $abilityEnergySpentByUser[$userId];
		$defenseByUser[$userId] = max(0, $health - $used);

		foreach ((array)($activePersistentRoundStartEffectsByUser[$userId] ?? []) as $sourceAbilityId => $persistentEffect) {
			if (!empty(($toggleActivatedByUser[$userId] ?? [])[$sourceAbilityId])) {
				continue;
			}

			$persistentPayload = is_array($persistentEffect['payload'] ?? null) ? (array)$persistentEffect['payload'] : [];
			if (!isset($persistentPayload['state']) || !is_array($persistentPayload['state'])) {
				continue;
			}

			$persistentState = (array)$persistentPayload['state'];
			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber + 1,
				'owner_user_id' => $userId,
				'target_user_id' => isset($persistentEffect['target_user_id']) && $persistentEffect['target_user_id'] !== null ? (int)$persistentEffect['target_user_id'] : null,
				'ability_instance_id' => null,
				'effect_key' => (string)($persistentEffect['effect_key'] ?? ('status:' . (string)($persistentState['state_key'] ?? 'state'))),
				'trigger_timing' => 'round_start',
				'payload' => $persistentPayload,
				'is_resolved' => 0,
				'resolved_at' => null,
			];
		}
		$defenseByUser[$userId] += max(0, (int)($roundStartDefenseBonusByUser[$userId] ?? 0)) + max(0, (int)($activatedDefenseBonusByUser[$userId] ?? 0));

		$roundEffectRows[] = [
			'game_id' => $gameId,
			'round_number' => $roundNumber,
			'owner_user_id' => $userId,
			'target_user_id' => null,
			'ability_instance_id' => null,
			'effect_key' => 'step4:energy_summary',
			'trigger_timing' => 'resolve',
			'payload' => [
				'energy_budget' => $energyBudget,
				'attack_energy_spent' => $attackEnergySpentByUser[$userId],
				'ability_energy_spent' => $abilityEnergySpentByUser[$userId],
				'total_energy_spent' => $totalEnergySpentByUser[$userId],
				'energy_remaining' => max(0, $energyBudget - $totalEnergySpentByUser[$userId]),
			],
			'is_resolved' => 1,
			'resolved_at' => gmdate('Y-m-d H:i:s'),
		];
	}

	foreach ($normalIncomingByTargetByAttacker as $targetId => $attackerMap) {
		if (empty($attackerMap)) {
			continue;
		}

		if (isset($schemingTargetByUser[$targetId])) {
			$schemingAttackerId = (int)$schemingTargetByUser[$targetId];
			$schemingAmount = max(0, (int)($attackerMap[$schemingAttackerId] ?? 0));
			if ($schemingAmount > 0) {
				$normalIncomingByTargetByAttacker[$targetId][$schemingAttackerId] = 0;
				$retaliationDamageByUser[$schemingAttackerId] = max(0, (int)($retaliationDamageByUser[$schemingAttackerId] ?? 0)) + $schemingAmount;
				$roundEffectRows[] = [
					'game_id' => $gameId,
					'round_number' => $roundNumber,
					'owner_user_id' => (int)$targetId,
					'target_user_id' => $schemingAttackerId,
					'ability_instance_id' => null,
					'effect_key' => 'trigger:scheming',
					'trigger_timing' => 'resolve',
					'payload' => ['negated_attack' => $schemingAmount],
					'is_resolved' => 1,
					'resolved_at' => gmdate('Y-m-d H:i:s'),
				];
			}
		}

		if (!empty($nimbleDodgeByUser[$targetId])) {
			$largestAttackerId = null;
			$largestAmount = -1;
			foreach ($attackerMap as $attackerId => $amount) {
				$amountInt = max(0, (int)$amount);
				if ($amountInt > $largestAmount || ($amountInt === $largestAmount && (int)$attackerId < (int)$largestAttackerId)) {
					$largestAmount = $amountInt;
					$largestAttackerId = (int)$attackerId;
				}
			}
			if ($largestAttackerId !== null && $largestAmount > 0) {
				$normalIncomingByTargetByAttacker[$targetId][$largestAttackerId] = 0;
				$roundEffectRows[] = [
					'game_id' => $gameId,
					'round_number' => $roundNumber,
					'owner_user_id' => (int)$targetId,
					'target_user_id' => $largestAttackerId,
					'ability_instance_id' => null,
					'effect_key' => 'trigger:nimble_dodge',
					'trigger_timing' => 'resolve',
					'payload' => ['negated_attack' => $largestAmount],
					'is_resolved' => 1,
					'resolved_at' => gmdate('Y-m-d H:i:s'),
				];
			}
		}

		$reduction = max(0, (int)($armorReductionByUser[$targetId] ?? 0));
		if ($reduction > 0) {
			foreach ($attackerMap as $attackerId => $amount) {
				$normalIncomingByTargetByAttacker[$targetId][$attackerId] = max(0, (int)$amount - $reduction);
			}
		}

		$mineLayerDamage = max(0, (int)($mineLayerDamageByUser[$targetId] ?? 0));
		if ($mineLayerDamage > 0) {
			foreach ($normalIncomingByTargetByAttacker[$targetId] as $attackerId => $amount) {
				if (max(0, (int)$amount) <= 0) {
					continue;
				}
				$retaliationDamageByUser[(int)$attackerId] = max(0, (int)($retaliationDamageByUser[(int)$attackerId] ?? 0)) + $mineLayerDamage;
			}
		}
	}

	$nextHealthByUser = [];

	foreach ($healthByUser as $userId => $health) {
		if ($health <= 0) {
			$nextHealthByUser[$userId] = 0;
			continue;
		}

		$normalByAttacker = $normalIncomingByTargetByAttacker[$userId] ?? [];
		$unblockableByAttacker = $unblockableIncomingByTargetByAttacker[$userId] ?? [];
		ksort($normalByAttacker, SORT_NUMERIC);
		ksort($unblockableByAttacker, SORT_NUMERIC);

		$remainingDefense = max(0, (int)($defenseByUser[$userId] ?? 0));
		$damageByAttacker = [];
		$defenseBlockedDamage = 0;
		$defenseOnlyByAttacker = $defenseOnlyIncomingByTargetByAttacker[$userId] ?? [];
		ksort($defenseOnlyByAttacker, SORT_NUMERIC);
		$defenseOnlyIncomingTotal = 0;
		foreach ($defenseOnlyByAttacker as $amount) {
			$defenseOnlyAmount = max(0, (int)$amount);
			$defenseOnlyIncomingTotal += $defenseOnlyAmount;
			$remainingDefense = max(0, $remainingDefense - $defenseOnlyAmount);
		}

		foreach ($normalByAttacker as $attackerId => $amount) {
			$normalAmount = max(0, (int)$amount);
			if ($normalAmount <= 0) {
				continue;
			}

			$absorbed = min($remainingDefense, $normalAmount);
			$remainingDefense -= $absorbed;
			$defenseBlockedDamage += $absorbed;
			$postDefense = $normalAmount - $absorbed;
			if ($postDefense > 0) {
				$damageByAttacker[(int)$attackerId] = max(0, (int)($damageByAttacker[(int)$attackerId] ?? 0)) + $postDefense;
			}
		}

		foreach ($unblockableByAttacker as $attackerId => $amount) {
			$unblockableAmount = max(0, (int)$amount);
			if ($unblockableAmount <= 0) {
				continue;
			}
			$damageByAttacker[(int)$attackerId] = max(0, (int)($damageByAttacker[(int)$attackerId] ?? 0)) + $unblockableAmount;
		}

		$damage = 0;
		foreach ($damageByAttacker as $attackerId => $amount) {
			$damage += max(0, (int)$amount);
			$reflectiveRatio = max(0.0, (float)($reflectiveDamageRatioByUser[$userId] ?? 0.0));
			if ($reflectiveRatio > 0.0 && isset($retaliationDamageByUser[(int)$attackerId])) {
				$retaliationDamageByUser[(int)$attackerId] += (int)floor(max(0, (int)$amount) * $reflectiveRatio);
			}
		}

		$preRetaliationHealth = max(0, $health - $damage - max(0, (int)($activationHealthLossByUser[$userId] ?? 0)));
		$nextHealthByUser[$userId] = min(1000, $preRetaliationHealth + max(0, (int)($activationHealingByUser[$userId] ?? 0)));

		$normalIncomingTotal = 0;
		foreach ($normalByAttacker as $v) {
			$normalIncomingTotal += max(0, (int)$v);
		}
		$unblockableIncomingTotal = 0;
		foreach ($unblockableByAttacker as $v) {
			$unblockableIncomingTotal += max(0, (int)$v);
		}
		$roundEffectRows[] = [
			'game_id' => $gameId,
			'round_number' => $roundNumber,
			'owner_user_id' => $userId,
			'target_user_id' => null,
			'ability_instance_id' => null,
			'effect_key' => 'step6:damage_resolution',
			'trigger_timing' => 'resolve',
			'payload' => [
				'normal_incoming' => $normalIncomingTotal,
				'defense_only_incoming' => $defenseOnlyIncomingTotal,
				'unblockable_incoming' => $unblockableIncomingTotal,
				'defense_available' => max(0, (int)($defenseByUser[$userId] ?? 0)),
				'final_damage' => $damage,
				'next_health' => $nextHealthByUser[$userId],
			],
			'is_resolved' => 1,
			'resolved_at' => gmdate('Y-m-d H:i:s'),
		];

		foreach ((array)($blockedDamageEnergyBonusRulesByUser[$userId] ?? []) as $ruleIndex => $bonusRule) {
			$multiplier = (float)($bonusRule['multiplier'] ?? 0);
			$energyBonus = max(0, (int)floor($defenseBlockedDamage * $multiplier));
			if ($energyBonus <= 0) {
				continue;
			}
			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber + 1,
				'owner_user_id' => $userId,
				'target_user_id' => null,
				'ability_instance_id' => null,
				'effect_key' => 'status:energy_bonus',
				'trigger_timing' => 'round_start',
				'payload' => [
					'effect_kind' => 'energy_bonus',
					'source_ability_id' => (string)($bonusRule['source_ability_id'] ?? ''),
					'energy_bonus' => $energyBonus,
				],
				'is_resolved' => 0,
				'resolved_at' => null,
			];
		}
	}

	foreach ($retaliationDamageByUser as $userId => $retaliationDamage) {
		if (!isset($nextHealthByUser[$userId]) || $retaliationDamage <= 0) {
			continue;
		}
		$nextHealthByUser[$userId] = max(0, (int)$nextHealthByUser[$userId] - $retaliationDamage);
	}

	foreach ($nextHealthByUser as $userId => $nextHealth) {
		foreach ((array)($roundEndUpkeepRulesByUser[$userId] ?? []) as $upkeepRule) {
			$upkeepLoss = max(0, (int)($upkeepRule['health_loss'] ?? 0));
			if ($upkeepLoss <= 0 || $nextHealth <= 0) {
				continue;
			}
			$nextHealthByUser[$userId] = max(0, $nextHealthByUser[$userId] - $upkeepLoss);
			$roundEffectRows[] = [
				'game_id' => $gameId,
				'round_number' => $roundNumber,
				'owner_user_id' => $userId,
				'target_user_id' => null,
				'ability_instance_id' => null,
				'effect_key' => 'step7:upkeep_cost',
				'trigger_timing' => 'resolve',
				'payload' => [
					'source_ability_id' => (string)($upkeepRule['source_ability_id'] ?? ''),
					'health_loss' => $upkeepLoss,
				],
				'is_resolved' => 1,
				'resolved_at' => gmdate('Y-m-d H:i:s'),
			];
		}
	}

	foreach ($nextHealthByUser as $userId => $nextHealth) {
		if ($nextHealth > 0) {
			continue;
		}
		$restoreAbilityId = '';
		$restoreHealth = 0;
		$restoreAbilityIndex = false;
		$restorePriority = PHP_INT_MIN;
		$removeFromOwned = false;
		foreach ($ownedAbilityIdsByUser[$userId] as $ownedIndex => $ownedAbilityId) {
			$ownedAbility = rumble_ability_by_id($ownedAbilityId);
			if ($ownedAbility === null) {
				continue;
			}
			$restoreRule = rumble_ability_on_defeat_restore_rule($ownedAbility);
			if ($restoreRule === null) {
				continue;
			}
			$priority = (int)($restoreRule['priority'] ?? 0);
			if ($priority < $restorePriority) {
				continue;
			}
			$restorePriority = $priority;
			$restoreAbilityId = $ownedAbilityId;
			$restoreHealth = max(0, (int)($restoreRule['restored_health'] ?? 0));
			$restoreAbilityIndex = $ownedIndex;
			$removeFromOwned = !empty($restoreRule['remove_from_owned']);
		}
		if ($restoreHealth <= 0) {
			continue;
		}

		$nextHealthByUser[$userId] = $restoreHealth;
		if ($removeFromOwned && $restoreAbilityIndex !== false) {
			unset($ownedAbilityIdsByUser[$userId][$restoreAbilityIndex]);
		}

		$ownedAbilityIdsByUser[$userId] = array_values($ownedAbilityIdsByUser[$userId]);
		sort($ownedAbilityIdsByUser[$userId], SORT_STRING);
		$ownedAbilitySetByUser[$userId] = array_fill_keys($ownedAbilityIdsByUser[$userId], true);

		$roundEffectRows[] = [
			'game_id' => $gameId,
			'round_number' => $roundNumber,
			'owner_user_id' => $userId,
			'target_user_id' => null,
			'ability_instance_id' => null,
			'effect_key' => 'trigger:on_defeat_restore',
			'trigger_timing' => 'resolve',
			'payload' => ['restored_health' => $restoreHealth, 'source_ability_id' => $restoreAbilityId],
			'is_resolved' => 1,
			'resolved_at' => gmdate('Y-m-d H:i:s'),
		];
	}

	$pdo->beginTransaction();
	try {
		$updateHealthStmt = $pdo->prepare(
			'UPDATE rumble_player_state SET current_health = :current_health, owned_abilities_json = :owned_abilities_json WHERE game_id = :game_id AND user_id = :user_id'
		);
		$defeatedUserIds = [];
		foreach ($nextHealthByUser as $userId => $nextHealth) {
			$updateHealthStmt->execute([
				'current_health' => $nextHealth,
				'owned_abilities_json' => rumble_encode_owned_abilities($ownedAbilityIdsByUser[$userId] ?? []),
				'game_id' => $gameId,
				'user_id' => $userId,
			]);

			if ($nextHealth <= 0) {
				$defeatedUserIds[] = $userId;
			}
		}

		if (!empty($defeatedUserIds)) {
			$rolePlaceholders = implode(',', array_fill(0, count($defeatedUserIds), '?'));
			$defeatRoleSql = 'UPDATE game_members SET role = ? WHERE game_id = ? AND user_id IN (' . $rolePlaceholders . ') AND role <> ?';
			$defeatRoleParams = array_merge(['observer', $gameId], $defeatedUserIds, ['observer']);
			$defeatRoleStmt = $pdo->prepare($defeatRoleSql);
			$defeatRoleStmt->execute($defeatRoleParams);
		}

		rumble_record_eliminations($pdo, $gameId, $roundNumber, $healthBeforeByUser, $defeatedUserIds);

		if (!empty($roundStartEffectIdsToResolve)) {
			$idPlaceholders = implode(',', array_fill(0, count($roundStartEffectIdsToResolve), '?'));
			$resolveSql = 'UPDATE rumble_round_effects SET is_resolved = 1, resolved_at = ? WHERE id IN (' . $idPlaceholders . ')';
			$resolveParams = array_merge([gmdate('Y-m-d H:i:s')], $roundStartEffectIdsToResolve);
			$resolveStmt = $pdo->prepare($resolveSql);
			$resolveStmt->execute($resolveParams);
		}

		if (!empty($roundEffectRows)) {
			$insertEffectStmt = $pdo->prepare(
				'INSERT INTO rumble_round_effects '
				. '(game_id, round_number, owner_user_id, target_user_id, ability_instance_id, effect_key, trigger_timing, payload, is_resolved, resolved_at) '
				. 'VALUES (:game_id, :round_number, :owner_user_id, :target_user_id, :ability_instance_id, :effect_key, :trigger_timing, :payload, :is_resolved, :resolved_at)'
			);
			foreach ($roundEffectRows as $effectRow) {
				$insertEffectStmt->execute([
					'game_id' => $effectRow['game_id'],
					'round_number' => $effectRow['round_number'],
					'owner_user_id' => $effectRow['owner_user_id'],
					'target_user_id' => $effectRow['target_user_id'],
					'ability_instance_id' => $effectRow['ability_instance_id'],
					'effect_key' => $effectRow['effect_key'],
					'trigger_timing' => $effectRow['trigger_timing'],
					'payload' => json_encode($effectRow['payload'], JSON_UNESCAPED_UNICODE),
					'is_resolved' => $effectRow['is_resolved'],
					'resolved_at' => $effectRow['resolved_at'],
				]);
			}
		}

		$stateStmt = $pdo->prepare(db_upsert_sql(
			'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round)',
			['game_id'],
			[
				'current_round' => db_greatest_sql('current_round', ':next_round'),
				'phase' => ':phase_update',
			]
		));
		$stateStmt->execute([
			'game_id' => $gameId,
			'phase' => 'battle',
			'current_round' => $roundNumber,
			'next_round' => $roundNumber + 1,
			'phase_update' => 'battle',
		]);

		rumble_finalize_standings_if_won($pdo, $gameId, $roundNumber);

		$pdo->commit();
	} catch (Throwable $ex) {
		$pdo->rollBack();
		throw $ex;
	}

	return count($orderRows);
}


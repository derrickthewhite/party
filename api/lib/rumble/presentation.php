<?php

// Presentation helpers for Rumble (payload builders, human text)

function rumble_round_effect_human_text(array $effectRow, array $nameByUser = []): string
{
	$effectKey = (string)($effectRow['effect_key'] ?? '');
	$ownerUserId = isset($effectRow['owner_user_id']) ? (int)$effectRow['owner_user_id'] : 0;
	$targetUserId = isset($effectRow['target_user_id']) && $effectRow['target_user_id'] !== null ? (int)$effectRow['target_user_id'] : 0;
	$ownerName = ($ownerUserId > 0 && isset($nameByUser[$ownerUserId])) ? (string)$nameByUser[$ownerUserId] : ('User ' . $ownerUserId);
	$targetName = ($targetUserId > 0 && isset($nameByUser[$targetUserId])) ? (string)$nameByUser[$targetUserId] : ($targetUserId > 0 ? ('User ' . $targetUserId) : '');

	$payloadRaw = $effectRow['payload'] ?? [];
	if (is_string($payloadRaw)) {
		$decoded = json_decode($payloadRaw, true);
		$payload = is_array($decoded) ? $decoded : [];
	} elseif (is_array($payloadRaw)) {
		$payload = $payloadRaw;
	} else {
		$payload = [];
	}

	if ($effectKey === 'step1:set_round_stats') {
		return $ownerName . ' starts round with Health ' . (int)($payload['health'] ?? 0) . ' and Energy ' . (int)($payload['energy_budget'] ?? 0) . '.';
	}
	if ($effectKey === 'step2:passive_round_start_heal') {
		return $ownerName . ' gains passive round-start healing: +' . (int)($payload['amount'] ?? 0) . ' Health from ' . (string)($payload['source_ability_id'] ?? 'unknown') . '.';
	}
	if ($effectKey === 'step2:passive_round_start_defense') {
		return $ownerName . ' gains round-start defense bonus: +' . (int)($payload['defense_bonus'] ?? 0) . '.';
	}
	if ($effectKey === 'step2:scheduled_status') {
		if (isset($payload['state']) && is_array($payload['state'])) {
			return $ownerName . ' receives scheduled status: ' . (string)($payload['state']['state_key'] ?? 'unknown') . '.';
		}
		return $ownerName . ' receives scheduled status: ' . (string)($payload['effect'] ?? 'unknown') . '.';
	}
	if (str_starts_with($effectKey, 'activation:')) {
		$abilityId = (string)($payload['ability_id'] ?? substr($effectKey, strlen('activation:')));
		$cost = (int)($payload['cost'] ?? 0);
		if ($targetName !== '') {
			return $ownerName . ' activates ' . $abilityId . ' on ' . $targetName . ' (cost ' . $cost . ').';
		}
		return $ownerName . ' activates ' . $abilityId . ' (cost ' . $cost . ').';
	}
	if ($effectKey === 'step4:energy_summary') {
		return $ownerName . ' energy spend summary: budget ' . (int)($payload['energy_budget'] ?? 0)
			. ', attacks ' . (int)($payload['attack_energy_spent'] ?? 0)
			. ', abilities ' . (int)($payload['ability_energy_spent'] ?? 0)
			. ', remaining ' . (int)($payload['energy_remaining'] ?? 0) . '.';
	}
	if ($effectKey === 'trigger:nimble_dodge') {
		return $ownerName . ' triggers Nimble Dodge and negates ' . (int)($payload['negated_attack'] ?? 0)
			. ' damage from ' . ($targetName !== '' ? $targetName : 'an attacker') . '.';
	}
	if ($effectKey === 'step6:damage_resolution') {
		return $ownerName . ' resolves damage: normal ' . (int)($payload['normal_incoming'] ?? 0)
			. ', unblockable ' . (int)($payload['unblockable_incoming'] ?? 0)
			. ', total ' . (int)($payload['final_damage'] ?? 0)
			. ', health now ' . (int)($payload['next_health'] ?? 0) . '.';
	}
	if ($effectKey === 'trigger:on_defeat_restore') {
		return $ownerName . ' triggers defeat restore and returns to ' . (int)($payload['restored_health'] ?? 0) . ' Health.';
	}
	if ($effectKey === 'step7:upkeep_cost') {
		return $ownerName . ' pays upkeep cost ' . (int)($payload['health_loss'] ?? 0)
			. ' from ' . (string)($payload['source_ability_id'] ?? 'unknown') . '.';
	}

	$parts = ['Event ' . $effectKey . ' by ' . $ownerName];
	if ($targetName !== '') {
		$parts[] = 'target ' . $targetName;
	}
	return implode(' | ', $parts);
}

function rumble_round_effect_payload(array $effectRow): array
{
	$payloadRaw = $effectRow['payload'] ?? [];
	if (is_string($payloadRaw)) {
		$decoded = json_decode($payloadRaw, true);
		return is_array($decoded) ? $decoded : [];
	}
	return is_array($payloadRaw) ? $payloadRaw : [];
}

function rumble_condition_display_text(string $raw): string
{
	$normalized = trim($raw);
	if ($normalized === '') {
		return '';
	}

	if (str_ends_with($normalized, '_active')) {
		$normalized = substr($normalized, 0, -strlen('_active'));
	}

	return implode(' ', array_map(
		static function (string $part): string {
			return ucfirst($part);
		},
		array_values(array_filter(explode('_', $normalized), static fn ($part): bool => trim((string)$part) !== ''))
	));
}

function rumble_condition_base_label(?array $ability, array $payload, ?array $state): string
{
	$effectKind = trim((string)($payload['effect_kind'] ?? ''));
	$abilityTitle = '';
	if ($ability !== null) {
		$abilityTitle = trim((string)($ability['name'] ?? $ability['title'] ?? ''));
	}

	if (($effectKind === 'delayed_attack' || $effectKind === 'attack_bonus') && $abilityTitle !== '') {
		return $abilityTitle;
	}

	$stateKey = trim((string)($state['state_key'] ?? ''));
	$relation = trim((string)($state['relation'] ?? ''));
	$scope = trim((string)($state['scope'] ?? ''));
	if ($abilityTitle !== '' && ($relation === 'symmetric' || $scope === 'pair')) {
		return $abilityTitle;
	}
	if ($stateKey !== '') {
		$stateLabel = rumble_condition_display_text($stateKey);
		if ($stateLabel !== '') {
			return $stateLabel;
		}
	}
	if ($abilityTitle !== '') {
		return $abilityTitle;
	}
	if ($effectKind !== '') {
		return rumble_condition_display_text($effectKind);
	}

	return 'Condition';
}

function rumble_condition_description(?array $ability, array $payload, ?array $state, string $ownerName, string $targetName): string
{
	$parts = [];
	$abilityDescription = trim((string)($ability['description'] ?? ''));
	if ($abilityDescription !== '') {
		$parts[] = $abilityDescription;
	}

	$effectKind = trim((string)($payload['effect_kind'] ?? ''));
	if ($effectKind === 'delayed_attack') {
		$damage = max(0, (int)($payload['damage'] ?? 0));
		if ($damage > 0) {
			$parts[] = $ownerName . ' has ' . $damage . ' delayed damage queued' . ($targetName !== '' ? ' for ' . $targetName : '') . '.';
		}
	} elseif ($effectKind === 'attack_bonus') {
		$bonusDamage = max(0, (int)($payload['bonus_damage'] ?? 0));
		if ($bonusDamage > 0) {
			$parts[] = 'Next attack bonus: +' . $bonusDamage . '.';
		}
	} elseif ($targetName !== '') {
		$relation = trim((string)($state['relation'] ?? ''));
		if ($relation === 'symmetric') {
			$parts[] = 'Linked players: ' . $ownerName . ' and ' . $targetName . '.';
		} else {
			$parts[] = 'Source: ' . $ownerName . '. Target: ' . $targetName . '.';
		}
	}

	return implode(' ', array_values(array_filter($parts, static fn ($part): bool => trim((string)$part) !== '')));
}

function rumble_condition_label_for_viewer(string $baseLabel, int $viewerUserId, int $ownerUserId, ?int $targetUserId, array $payload, ?array $state, array $nameByUser): string
{
	$ownerName = ($ownerUserId > 0 && isset($nameByUser[$ownerUserId])) ? (string)$nameByUser[$ownerUserId] : ('User ' . $ownerUserId);
	$targetName = ($targetUserId !== null && $targetUserId > 0 && isset($nameByUser[$targetUserId])) ? (string)$nameByUser[$targetUserId] : ($targetUserId !== null && $targetUserId > 0 ? ('User ' . $targetUserId) : '');
	$effectKind = trim((string)($payload['effect_kind'] ?? ''));
	$relation = trim((string)($state['relation'] ?? ''));
	$scope = trim((string)($state['scope'] ?? ''));

	if ($effectKind === 'delayed_attack' && $targetName !== '') {
		if ($viewerUserId === $ownerUserId) {
			return $baseLabel . ' -> ' . $targetName;
		}
		if ($viewerUserId === $targetUserId) {
			return $baseLabel . ' <- ' . $ownerName;
		}
	}

	if (($relation === 'symmetric' || $scope === 'pair') && $targetName !== '') {
		if ($viewerUserId === $ownerUserId) {
			return $baseLabel . ' <-> ' . $targetName;
		}
		if ($viewerUserId === $targetUserId) {
			return $baseLabel . ' <-> ' . $ownerName;
		}
	}

	return $baseLabel;
}

function rumble_build_active_conditions_by_user(array $playerRows, array $roundStartEffects, array $nameByUser): array
{
	$conditionsByUser = [];
	$playerIds = [];
	foreach ($playerRows as $row) {
		$userId = (int)($row['user_id'] ?? 0);
		if ($userId <= 0) {
			continue;
		}
		$conditionsByUser[$userId] = [];
		$playerIds[$userId] = true;
	}

	foreach ($roundStartEffects as $effectRow) {
		$effectId = (int)($effectRow['id'] ?? 0);
		$ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
		$targetUserId = isset($effectRow['target_user_id']) && $effectRow['target_user_id'] !== null ? (int)$effectRow['target_user_id'] : null;
		if ($ownerUserId <= 0 || !isset($playerIds[$ownerUserId])) {
			continue;
		}

		$payload = rumble_round_effect_payload($effectRow);
		$state = rumble_runtime_state_from_payload($payload, $ownerUserId, $targetUserId);
		$effectKind = trim((string)($payload['effect_kind'] ?? ''));
		if ($state === null && $effectKind !== 'delayed_attack' && $effectKind !== 'attack_bonus') {
			continue;
		}

		$sourceAbilityId = rumble_canonical_ability_id((string)($payload['source_ability_id'] ?? ''));
		$ability = $sourceAbilityId !== '' ? rumble_ability_by_id($sourceAbilityId) : null;
		$baseLabel = rumble_condition_base_label($ability, $payload, $state);
		$ownerName = ($ownerUserId > 0 && isset($nameByUser[$ownerUserId])) ? (string)$nameByUser[$ownerUserId] : ('User ' . $ownerUserId);
		$targetName = ($targetUserId !== null && $targetUserId > 0 && isset($nameByUser[$targetUserId])) ? (string)$nameByUser[$targetUserId] : ($targetUserId !== null && $targetUserId > 0 ? ('User ' . $targetUserId) : '');
		$description = rumble_condition_description($ability, $payload, $state, $ownerName, $targetName);

		$viewerIds = [$ownerUserId];
		if ($targetUserId !== null && $targetUserId > 0 && isset($playerIds[$targetUserId])) {
			$viewerIds[] = $targetUserId;
		}

		foreach (array_values(array_unique($viewerIds)) as $viewerUserId) {
			$conditionsByUser[$viewerUserId][] = [
				'id' => 'round_effect_' . $effectId . '_' . $viewerUserId,
				'effect_row_id' => $effectId,
				'source_ability_id' => $sourceAbilityId,
				'owner_user_id' => $ownerUserId,
				'target_user_id' => $targetUserId,
				'effect_kind' => $effectKind,
				'state_key' => $state !== null ? (string)($state['state_key'] ?? '') : '',
				'label' => rumble_condition_label_for_viewer($baseLabel, $viewerUserId, $ownerUserId, $targetUserId, $payload, $state, $nameByUser),
				'description' => $description,
			];
		}
	}

	foreach ($conditionsByUser as &$conditions) {
		usort($conditions, static function (array $left, array $right): int {
			$leftId = (int)($left['effect_row_id'] ?? 0);
			$rightId = (int)($right['effect_row_id'] ?? 0);
			if ($leftId !== $rightId) {
				return $leftId <=> $rightId;
			}
			return strcmp((string)($left['label'] ?? ''), (string)($right['label'] ?? ''));
		});
	}
	unset($conditions);

	return $conditionsByUser;
}

function rumble_build_final_standings(int $gameId): ?array
{
	if (!rumble_has_standings_table()) {
		return null;
	}

	$stmt = db()->prepare(
		'SELECT gps.user_id, gps.final_rank, gps.eliminated_round, gps.result_status, u.username, rps.ship_name, ' . game_member_icon_select_sql('gm', 'icon_key') . ' '
		. 'FROM game_player_standings gps '
		. 'JOIN users u ON u.id = gps.user_id '
		. 'JOIN game_members gm ON gm.game_id = gps.game_id AND gm.user_id = gps.user_id '
		. 'LEFT JOIN rumble_player_state rps ON rps.game_id = gps.game_id AND rps.user_id = gps.user_id '
		. 'WHERE gps.game_id = ? AND gps.final_rank IS NOT NULL AND u.is_active = 1 '
		. 'ORDER BY gps.final_rank ASC, u.username ASC'
	);
	$stmt->execute([$gameId]);
	$rows = $stmt->fetchAll();
	if (empty($rows)) {
		return null;
	}

	$winnerNames = [];
	$entries = [];
	foreach ($rows as $row) {
		$rank = (int)$row['final_rank'];
		$username = (string)$row['username'];
		if ($rank === 1) {
			$winnerNames[] = $username;
		}
		$entries[] = [
			'user_id' => (int)$row['user_id'],
			'rank' => $rank,
			'username' => $username,
			'icon_key' => game_normalize_icon_key($row['icon_key'] ?? null),
			'ship_name' => trim((string)($row['ship_name'] ?? '')) !== '' ? trim((string)$row['ship_name']) : $username,
			'eliminated_round' => $row['eliminated_round'] !== null ? (int)$row['eliminated_round'] : null,
			'result_status' => (string)$row['result_status'],
		];
	}

	return [
		'winner_name' => implode(', ', $winnerNames),
		'entries' => $entries,
	];
}

function rumble_game_build_detail_payload(int $gameId, array $game, array $user): array
{
	$isInProgress = (string)($game['status'] ?? '') === 'in_progress';
	$roundNumber = (int)($game['current_round'] ?? 1);
	$phase = (string)($game['phase'] ?? default_phase_for_game_type((string)$game['game_type']));

	if ($isInProgress) {
		rumble_initialize_player_state($gameId);
	}
	if ($isInProgress && $phase === 'bidding') {
		rumble_ensure_bidding_offer($gameId, $roundNumber, (int)$game['owner_user_id']);
	}

	$participantsStmt = db()->prepare(
		'SELECT COUNT(*) FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
		. ' AND COALESCE(rps.current_health, 100) > 0'
	);
	$participantsStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);
	$participantCount = (int)$participantsStmt->fetchColumn();

	$submittedActionType = $phase === 'bidding' ? 'bid' : 'order';
	$submittedStmt = db()->prepare(
		'SELECT COUNT(DISTINCT user_id) FROM game_actions '
		. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
	);
	$submittedStmt->execute([
		'game_id' => $gameId,
		'round_number' => $roundNumber,
		'action_type' => $submittedActionType,
	]);
	$submittedCount = (int)$submittedStmt->fetchColumn();

	$playersStmt = db()->prepare(
		'SELECT gm.user_id, u.username, COALESCE(rps.current_health, 100) AS current_health, COALESCE(rps.starting_health, 100) AS starting_health, gm.role, ' . game_member_icon_select_sql('gm', 'icon_key') . ', rps.ship_name, rps.owned_abilities_json '
		. 'FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND u.is_active = 1 '
		. 'AND (gm.role <> :observer_role OR rps.user_id IS NOT NULL) '
		. 'ORDER BY COALESCE(rps.current_health, 100) > 0 DESC, u.username ASC'
	);
	$playersStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);
	$players = [];
	$playerNameByUserId = [];
	$playerRows = [];
	foreach ($playersStmt->fetchAll() as $row) {
		$ownedAbilityIds = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
		$ownedAbilities = rumble_owned_abilities_public_view($ownedAbilityIds);
		$currentHealth = max(0, (int)$row['current_health']);
		$playerRows[] = [
			'user_id' => (int)$row['user_id'],
			'current_health' => $currentHealth,
			'starting_health' => max(0, (int)($row['starting_health'] ?? 100)),
			'owned_ability_ids' => $ownedAbilityIds,
		];

		$players[] = [
			'user_id' => (int)$row['user_id'],
			'username' => (string)$row['username'],
			'icon_key' => game_normalize_icon_key($row['icon_key'] ?? null),
			'ship_name' => trim((string)($row['ship_name'] ?? '')) !== ''
				? trim((string)$row['ship_name'])
				: (string)$row['username'],
			'health' => $currentHealth,
			'starting_health' => max(0, (int)($row['starting_health'] ?? 100)),
			'energy_budget' => rumble_player_round_energy_budget($currentHealth, $ownedAbilityIds),
			'is_self' => (int)$row['user_id'] === (int)$user['id'],
			'is_defeated' => (int)$row['current_health'] <= 0,
			'member_role' => (string)$row['role'],
			'owned_abilities' => $ownedAbilities,
		];

		$playerNameByUserId[(int)$row['user_id']] = trim((string)($row['ship_name'] ?? '')) !== ''
			? trim((string)$row['ship_name'])
			: (string)$row['username'];
	}

	$roundStartEffects = rumble_fetch_round_start_effects($gameId, $roundNumber);
	$roundStartEnergyBonusByUser = [];
	foreach ($roundStartEffects as $effectRow) {
		$ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
		if ($ownerUserId <= 0) {
			continue;
		}

		$payload = rumble_round_effect_payload($effectRow);
		if ((string)($payload['effect_kind'] ?? '') !== 'energy_bonus') {
			continue;
		}

		$roundStartEnergyBonusByUser[$ownerUserId] = max(0, (int)($roundStartEnergyBonusByUser[$ownerUserId] ?? 0))
			+ max(0, (int)($payload['energy_bonus'] ?? 0));
	}
	$targetingState = rumble_collect_round_targeting_state($playerRows, $roundStartEffects);
	$activeConditionsByUser = rumble_build_active_conditions_by_user($playerRows, $roundStartEffects, $playerNameByUserId);
	$selfUserId = (int)$user['id'];
	$selfCannotAttack = !empty($targetingState['cannot_attack_by_user'][$selfUserId]);
	foreach ($players as &$playerEntry) {
		$playerId = (int)$playerEntry['user_id'];
		$isOpponentTargetable = empty($targetingState['untargetable_by_user'][$playerId]);
		$isBlockedForSelfAttack = $selfCannotAttack || !empty(($targetingState['blocked_attack_targets_by_user'][$selfUserId] ?? [])[$playerId]);
		$playerEntry['is_opponent_targetable'] = $isOpponentTargetable;
		$playerEntry['can_be_attacked_by_self'] = $isOpponentTargetable && !$isBlockedForSelfAttack;
		$playerEntry['cannot_attack'] = !empty($targetingState['cannot_attack_by_user'][$playerId]);
		$playerEntry['energy_budget'] = max(0, (int)($playerEntry['energy_budget'] ?? 0)) + max(0, (int)($roundStartEnergyBonusByUser[$playerId] ?? 0));
		$playerEntry['blocked_attack_target_user_ids'] = array_map(
			'intval',
			array_keys((array)($targetingState['blocked_attack_targets_by_user'][$playerId] ?? []))
		);
		$playerEntry['active_conditions'] = array_values((array)($activeConditionsByUser[$playerId] ?? []));
	}
	unset($playerEntry);

	$offer = rumble_fetch_offer_payload($gameId, $roundNumber);
	$offeredAbilities = [];
	foreach (($offer['items'] ?? []) as $offerItem) {
		$publicItem = rumble_offer_item_public_view($offerItem);
		if ($publicItem === null) {
			continue;
		}
		$offeredAbilities[] = $publicItem;
	}

	$currentBids = null;
	if ($phase === 'bidding') {
		$currentBidStmt = db()->prepare(
			'SELECT payload FROM game_actions '
			. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type AND user_id = :user_id '
			. 'ORDER BY id DESC LIMIT 1'
		);
		$currentBidStmt->execute([
			'game_id' => $gameId,
			'round_number' => $roundNumber,
			'action_type' => 'bid',
			'user_id' => (int)$user['id'],
		]);
		$currentBidPayload = $currentBidStmt->fetchColumn();
		if ($currentBidPayload !== false) {
			$decodedBid = json_decode((string)$currentBidPayload, true);
			$currentBids = rumble_normalize_bid_map(isset($decodedBid['bids']) ? $decodedBid['bids'] : [], (array)($offer['items'] ?? []));
		}
	}

	$currentOrderStmt = db()->prepare(
		'SELECT payload FROM game_actions '
		. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type AND user_id = :user_id '
		. 'ORDER BY id DESC LIMIT 1'
	);
	$currentOrderStmt->execute([
		'game_id' => $gameId,
		'round_number' => $roundNumber,
		'action_type' => 'order',
		'user_id' => (int)$user['id'],
	]);
	$currentPayloadRaw = $currentOrderStmt->fetchColumn();
	$currentOrder = null;
	if ($currentPayloadRaw !== false) {
		$decoded = json_decode((string)$currentPayloadRaw, true);
		if (is_array($decoded)) {
			$attacks = is_array($decoded['attacks'] ?? null) ? $decoded['attacks'] : [];
			$normalizedAttacks = [];
			foreach ($attacks as $targetKey => $amountRaw) {
				if ((!is_int($targetKey) && !ctype_digit((string)$targetKey)) || (!is_int($amountRaw) && !ctype_digit((string)$amountRaw))) {
					continue;
				}

				$amount = (int)$amountRaw;
				if ($amount <= 0) {
					continue;
				}

				$normalizedAttacks[(string)((int)$targetKey)] = $amount;
			}

			$defense = $decoded['defense'] ?? 0;
			$abilityActivations = rumble_normalize_ability_activations($decoded['ability_activations'] ?? []);
			$abilityEnergySpent = 0;
			foreach ($abilityActivations as $activation) {
				$abilityEnergySpent += rumble_activation_energy_cost($activation);
			}
			$attackEnergySpent = 0;
			foreach ($normalizedAttacks as $amount) {
				$attackEnergySpent += max(0, (int)$amount);
			}
			$currentOrder = [
				'attacks' => $normalizedAttacks,
				'ability_activations' => $abilityActivations,
				'defense' => max(0, (int)$defense),
				'energy_budget' => max(0, (int)($decoded['energy_budget'] ?? 0)),
				'attack_energy_spent' => max(0, (int)($decoded['attack_energy_spent'] ?? $attackEnergySpent)),
				'ability_energy_spent' => max(0, (int)($decoded['ability_energy_spent'] ?? $abilityEnergySpent)),
				'total_energy_spent' => max(0, (int)($decoded['total_energy_spent'] ?? ($attackEnergySpent + $abilityEnergySpent))),
			];
		}
	}

	$previousRound = max(0, $roundNumber - 1);
	$previousOrders = [];
	$currentRoundEvents = [];
	$previousRoundEvents = [];

	$eventRowsStmt = db()->prepare(
		'SELECT id, round_number, owner_user_id, target_user_id, effect_key, trigger_timing, payload, created_at '
		. 'FROM rumble_round_effects '
		. 'WHERE game_id = :game_id AND round_number IN (:current_round, :previous_round) '
		. 'ORDER BY round_number ASC, id ASC'
	);
	$eventRowsStmt->execute([
		'game_id' => $gameId,
		'current_round' => $roundNumber,
		'previous_round' => $previousRound,
	]);
	foreach ($eventRowsStmt->fetchAll() as $eventRow) {
		$roundForEvent = (int)($eventRow['round_number'] ?? 0);
		$payload = json_decode((string)($eventRow['payload'] ?? '{}'), true);
		$normalizedEvent = [
			'id' => (int)($eventRow['id'] ?? 0),
			'round_number' => $roundForEvent,
			'owner_user_id' => (int)($eventRow['owner_user_id'] ?? 0),
			'target_user_id' => isset($eventRow['target_user_id']) ? ($eventRow['target_user_id'] === null ? null : (int)$eventRow['target_user_id']) : null,
			'effect_key' => (string)($eventRow['effect_key'] ?? ''),
			'trigger_timing' => (string)($eventRow['trigger_timing'] ?? ''),
			'payload' => is_array($payload) ? $payload : [],
			'text' => rumble_round_effect_human_text([
				'effect_key' => (string)($eventRow['effect_key'] ?? ''),
				'owner_user_id' => (int)($eventRow['owner_user_id'] ?? 0),
				'target_user_id' => isset($eventRow['target_user_id']) ? ($eventRow['target_user_id'] === null ? null : (int)$eventRow['target_user_id']) : null,
				'payload' => is_array($payload) ? $payload : [],
			], $playerNameByUserId),
			'created_at' => (string)($eventRow['created_at'] ?? ''),
		];

		if ($roundForEvent === $roundNumber) {
			$currentRoundEvents[] = $normalizedEvent;
		} elseif ($roundForEvent === $previousRound) {
			$previousRoundEvents[] = $normalizedEvent;
		}
	}

	if ($previousRound > 0) {
		$previousStmt = db()->prepare(
			'SELECT a.user_id, u.username, a.payload FROM game_actions a '
			. 'JOIN users u ON u.id = a.user_id '
			. 'WHERE a.game_id = :game_id AND a.round_number = :round_number AND a.action_type = :action_type '
			. 'ORDER BY u.username ASC'
		);
		$previousStmt->execute([
			'game_id' => $gameId,
			'round_number' => $previousRound,
			'action_type' => 'order',
		]);

		foreach ($previousStmt->fetchAll() as $row) {
			$decoded = json_decode((string)$row['payload'], true);
			if (!is_array($decoded)) {
				$decoded = [];
			}

			$attacks = is_array($decoded['attacks'] ?? null) ? $decoded['attacks'] : [];
			$normalizedAttacks = [];
			foreach ($attacks as $targetKey => $amountRaw) {
				if ((!is_int($targetKey) && !ctype_digit((string)$targetKey)) || (!is_int($amountRaw) && !ctype_digit((string)$amountRaw))) {
					continue;
				}

				$amount = (int)$amountRaw;
				if ($amount <= 0) {
					continue;
				}

				$normalizedAttacks[(string)((int)$targetKey)] = $amount;
			}

			$previousOrders[] = [
				'user_id' => (int)$row['user_id'],
				'username' => (string)$row['username'],
				'attacks' => $normalizedAttacks,
				'ability_activations' => rumble_normalize_ability_activations($decoded['ability_activations'] ?? []),
				'defense' => max(0, (int)($decoded['defense'] ?? 0)),
				'energy_budget' => max(0, (int)($decoded['energy_budget'] ?? 0)),
				'attack_energy_spent' => max(0, (int)($decoded['attack_energy_spent'] ?? 0)),
				'ability_energy_spent' => max(0, (int)($decoded['ability_energy_spent'] ?? 0)),
				'total_energy_spent' => max(0, (int)($decoded['total_energy_spent'] ?? 0)),
			];
		}
	}

	return [
		'final_standings' => rumble_build_final_standings($gameId),
		'rumble_turn_progress' => [
			'phase_mode' => $phase,
			'round_number' => $roundNumber,
			'submitted_count' => $submittedCount,
			'participant_count' => $participantCount,
			'players' => $players,
			'ability_catalog' => rumble_ability_catalog_public_view(),
			'offered_abilities' => $offeredAbilities,
			'current_bids' => $currentBids,
			'current_order' => $currentOrder,
			'current_round_event_log' => $currentRoundEvents,
			'previous_round_orders' => $previousOrders,
			'previous_round_event_log' => $previousRoundEvents,
		],
	];
}


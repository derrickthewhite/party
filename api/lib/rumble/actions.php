<?php

// Action endpoint wrappers for Rumble

function rumble_action_upsert_ship_name(int $gameId): void
{
	$user = require_user();
	$role = game_require_member_or_403((int)$user['id'], $gameId);
	if ($role === 'observer') {
		error_response('Observers cannot set ship names.', 403);
	}

	$game = game_find_by_id($gameId);
	if ($game === null) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('This endpoint is only available for rumble games.', 409);
	}

	$body = json_input();
	$shipNameRaw = (string)($body['ship_name'] ?? '');
	$shipName = trim($shipNameRaw);
	if (strlen($shipName) > 60) {
		error_response('Ship name must be at most 60 characters.', 422);
	}

	$saveValue = $shipName === '' ? null : $shipName;

	$stmt = db()->prepare(db_upsert_sql(
		'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health, ship_name, owned_abilities_json) '
		. 'VALUES (:game_id, :user_id, 100, 100, :ship_name, :owned_abilities_json)',
		['game_id', 'user_id'],
		[
			'ship_name' => ':ship_name_update',
			'starting_health' => 'starting_health',
		]
	));
	$stmt->execute([
		'game_id' => $gameId,
		'user_id' => (int)$user['id'],
		'ship_name' => $saveValue,
		'owned_abilities_json' => json_encode([], JSON_UNESCAPED_UNICODE),
		'ship_name_update' => $saveValue,
	]);

	success_response([
		'updated' => true,
		'ship_name' => $saveValue ?? (string)($user['username'] ?? ''),
	]);
}

function rumble_action_cancel_bids(int $gameId): void
{
	$user = require_user();
	$role = game_require_member_or_403((int)$user['id'], $gameId);
	if ($role === 'observer') {
		error_response('Observers cannot submit bids.', 403);
	}

	$game = game_find_by_id($gameId);
	if ($game === null) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('This endpoint is only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Bids are only allowed while game is in progress.', 409);
	}

	$stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
	$stateStmt->execute(['game_id' => $gameId]);
	$state = $stateStmt->fetch();
	$roundNumber = (int)($state['current_round'] ?? 1);
	$phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
	if ($phase !== 'bidding') {
		error_response('Bids are only allowed during bidding phase.', 409);
	}

	$deleteStmt = db()->prepare(
		'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
	);
	$deleteStmt->execute([
		'game_id' => $gameId,
		'user_id' => (int)$user['id'],
		'round_number' => $roundNumber,
		'action_type' => 'bid',
	]);

	success_response([
		'canceled' => true,
		'deleted' => $deleteStmt->rowCount() > 0,
		'phase' => 'bidding',
		'round' => $roundNumber,
	]);
}

function rumble_action_end_bidding(int $gameId): void
{
	$user = require_user();
	$game = game_find_by_id($gameId);
	if ($game === null) {
		error_response('Game not found.', 404);
	}

	$role = game_member_role((int)$user['id'], $gameId);
	$isOwner = (int)$game['owner_user_id'] === (int)$user['id'];
	$isAdmin = (int)($user['is_admin'] ?? 0) === 1;
	if ($role === null && !$isAdmin) {
		error_response('Only game members can perform this action.', 403);
	}
	if (!$isOwner && !$isAdmin) {
		error_response('Only the game owner or an admin can end bidding.', 403);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('This endpoint is only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Bids are only allowed while game is in progress.', 409);
	}

	$stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
	$stateStmt->execute(['game_id' => $gameId]);
	$state = $stateStmt->fetch();
	$roundNumber = (int)($state['current_round'] ?? 1);
	$phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
	if ($phase !== 'bidding') {
		error_response('Bidding is already closed for this round.', 409);
	}

	$resolved = rumble_action_resolve_bidding_and_enter_battle($gameId, $roundNumber);

	success_response([
		'resolved' => true,
		'phase' => 'battle',
		'round' => $roundNumber,
		'assigned_count' => $resolved,
	]);
}

function rumble_action_maybe_auto_resolve_bidding(int $gameId, int $roundNumber): void
{
	$stateStmt = db()->prepare('SELECT phase FROM game_state WHERE game_id = :game_id LIMIT 1');
	$stateStmt->execute(['game_id' => $gameId]);
	$phase = (string)($stateStmt->fetchColumn() ?: 'bidding');
	if ($phase !== 'bidding') {
		return;
	}

	$participantsStmt = db()->prepare(
		'SELECT COUNT(*) FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
		. 'AND COALESCE(rps.current_health, 100) > 0'
	);
	$participantsStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);
	$participantCount = (int)$participantsStmt->fetchColumn();
	if ($participantCount <= 0) {
		return;
	}

	$submittedStmt = db()->prepare(
		'SELECT COUNT(DISTINCT user_id) FROM game_actions '
		. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
	);
	$submittedStmt->execute([
		'game_id' => $gameId,
		'round_number' => $roundNumber,
		'action_type' => 'bid',
	]);
	$submittedCount = (int)$submittedStmt->fetchColumn();
	if ($submittedCount < $participantCount) {
		return;
	}

	rumble_action_resolve_bidding_and_enter_battle($gameId, $roundNumber);
}

function rumble_action_current_offer(int $gameId, int $roundNumber): ?array
{
	$offerStmt = db()->prepare(
		'SELECT payload FROM game_actions '
		. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type '
		. 'ORDER BY id DESC LIMIT 1'
	);
	$offerStmt->execute([
		'game_id' => $gameId,
		'round_number' => $roundNumber,
		'action_type' => 'ability_offer',
	]);
	$raw = $offerStmt->fetchColumn();
	if ($raw === false) {
		return null;
	}

	$payload = json_decode((string)$raw, true);
	if (!is_array($payload)) {
		return null;
	}

	$items = rumble_normalize_offer_items($payload);

	return [
		'items' => $items,
		'ability_ids' => array_values(array_map(static fn (array $item): string => (string)$item['ability_id'], $items)),
	];
}

function rumble_ensure_bidding_offer(int $gameId, int $roundNumber, int $actorUserId): void
{
	$existingStmt = db()->prepare(
		'SELECT id FROM game_actions '
		. 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type '
		. 'ORDER BY id DESC LIMIT 1'
	);
	$existingStmt->execute([
		'game_id' => $gameId,
		'round_number' => $roundNumber,
		'action_type' => 'ability_offer',
	]);
	if ($existingStmt->fetchColumn() !== false) {
		return;
	}

	$participantsStmt = db()->prepare(
		'SELECT COUNT(*) FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
	);
	$participantsStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);
	$participantCount = max(0, (int)$participantsStmt->fetchColumn());

	$abilityCount = count(rumble_ability_library());
	$offerCount = min($abilityCount, max(0, $participantCount * 2));
	$offeredAbilityIds = rumble_pick_random_abilities($offerCount);
	$offeredItems = [];
	foreach ($offeredAbilityIds as $index => $abilityId) {
		$offeredItems[] = [
			'offer_item_key' => rumble_offer_item_key((int)$index, (string)$abilityId),
			'ability_id' => (string)$abilityId,
		];
	}

	$insertStmt = db()->prepare(
		'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
		. 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
	);
	$insertStmt->execute([
		'game_id' => $gameId,
		'user_id' => $actorUserId,
		'action_type' => 'ability_offer',
		'payload' => json_encode(['items' => $offeredItems], JSON_UNESCAPED_UNICODE),
		'round_number' => $roundNumber,
		'phase' => 'bidding',
		'revealed_at' => gmdate('Y-m-d H:i:s'),
	]);
}

function rumble_action_cancel_order(int $gameId): void
{
	$user = require_user();
	$role = game_require_member_or_403((int)$user['id'], $gameId);
	if ($role === 'observer') {
		error_response('Observers cannot submit actions.', 403);
	}

	$game = game_find_by_id($gameId);
	if ($game === null) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('This endpoint is only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Game actions are only allowed while game is in progress.', 409);
	}

	$stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
	$stateStmt->execute(['game_id' => $gameId]);
	$state = $stateStmt->fetch();
	$roundNumber = (int)($state['current_round'] ?? 1);
	$phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
	if ($phase !== 'battle') {
		error_response('Rumble orders are only available during battle phase.', 409);
	}

	$deleteStmt = db()->prepare(
		'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
	);
	$deleteStmt->execute([
		'game_id' => $gameId,
		'user_id' => (int)$user['id'],
		'round_number' => $roundNumber,
		'action_type' => 'order',
	]);

	success_response([
		'canceled' => true,
		'deleted' => $deleteStmt->rowCount() > 0,
		'round' => $roundNumber,
	]);
}

function rumble_action_upsert_order(int $gameId): void
{
	$user = require_user();
	$role = game_require_member_or_403((int)$user['id'], $gameId);
	if ($role === 'observer') {
		error_response('Observers cannot submit actions.', 403);
	}

	$game = game_find_by_id($gameId);
	if ($game === null) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('This endpoint is only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Game actions are only allowed while game is in progress.', 409);
	}

	$stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
	$stateStmt->execute(['game_id' => $gameId]);
	$state = $stateStmt->fetch();

	$roundNumber = (int)($state['current_round'] ?? 1);
	$phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
	if ($phase !== 'battle') {
		error_response('Rumble orders are only available during battle phase.', 409);
	}

	$ensureStmt = db()->prepare(db_upsert_sql(
		'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health) VALUES (:game_id, :user_id, 100, 100)',
		['game_id', 'user_id'],
		[
			'current_health' => 'current_health',
			'starting_health' => 'starting_health',
		]
	));
	$ensureStmt->execute([
		'game_id' => $gameId,
		'user_id' => (int)$user['id'],
	]);

	$healthStmt = db()->prepare('SELECT current_health, owned_abilities_json FROM rumble_player_state WHERE game_id = :game_id AND user_id = :user_id LIMIT 1');
	$healthStmt->execute([
		'game_id' => $gameId,
		'user_id' => (int)$user['id'],
	]);
	$stateRow = $healthStmt->fetch();
	$currentHealth = (int)($stateRow['current_health'] ?? 0);
	if ($currentHealth <= 0) {
		error_response('Eliminated players cannot submit orders.', 409);
	}

	$ownedAbilityIds = rumble_parse_owned_abilities(isset($stateRow['owned_abilities_json']) ? (string)$stateRow['owned_abilities_json'] : null);
	$ownedAbilityMap = array_fill_keys(array_keys(rumble_owned_ability_counts($ownedAbilityIds)), true);
	$ownedAbilityCounts = rumble_owned_ability_counts($ownedAbilityIds);

	$body = json_input();
	$attacksRaw = $body['attacks'] ?? [];
	$abilityActivationsRaw = $body['ability_activations'] ?? [];
	if (!is_array($attacksRaw)) {
		error_response('Attacks must be an object keyed by target user id.', 422);
	}

	try {
		$normalizedAbilityActivations = rumble_normalize_ability_activations($abilityActivationsRaw, true);
	} catch (InvalidArgumentException $ex) {
		error_response($ex->getMessage(), 422);
	}

	$targetsStmt = db()->prepare(
		'SELECT gm.user_id, COALESCE(rps.current_health, 100) AS current_health, rps.owned_abilities_json FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
	);
	$targetsStmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
	]);
	$targetRows = $targetsStmt->fetchAll();
	$roundStartEffects = rumble_fetch_round_start_effects($gameId, $roundNumber);
	$targetingState = rumble_collect_round_targeting_state($targetRows, $roundStartEffects);
	$alivePlayerCount = 0;
	foreach ((array)($targetingState['alive_by_user'] ?? []) as $isAlive) {
		if (!empty($isAlive)) {
			$alivePlayerCount++;
		}
	}
	$validAttackTargetMap = [];
	$validAbilityTargetMap = [];
	foreach ($targetRows as $targetRow) {
		$targetId = (int)($targetRow['user_id'] ?? 0);
		if ($targetId <= 0 || $targetId === (int)$user['id']) {
			continue;
		}
		if (empty($targetingState['alive_by_user'][$targetId])) {
			continue;
		}
		if (!empty($targetingState['untargetable_by_user'][$targetId])) {
			continue;
		}
		$validAbilityTargetMap[$targetId] = true;
		if (!empty($targetingState['cannot_attack_by_user'][(int)$user['id']])) {
			continue;
		}
		if (!empty(($targetingState['blocked_attack_targets_by_user'][(int)$user['id']] ?? [])[$targetId])) {
			continue;
		}
		$validAttackTargetMap[$targetId] = true;
	}

	$normalizedAttacks = [];
	foreach ($attacksRaw as $targetKey => $amountRaw) {
		if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
			error_response('Attack target ids must be integers.', 422);
		}

		$targetId = (int)$targetKey;
		if (!isset($validAttackTargetMap[$targetId])) {
			error_response('One or more attack targets are invalid.', 422);
		}

		if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
			error_response('Attack amounts must be whole non-negative numbers.', 422);
		}

		$amount = (int)$amountRaw;
		if ($amount < 0) {
			error_response('Attack amounts must be non-negative.', 422);
		}

		if ($amount === 0) {
			continue;
		}

		$normalizedAttacks[(string)$targetId] = $amount;
	}

	$activationCounts = [];
	$activationCopyKeys = [];
	foreach ($normalizedAbilityActivations as $activation) {
		$abilityId = (string)($activation['ability_id'] ?? '');
		if ($abilityId === '' || !isset($ownedAbilityMap[$abilityId])) {
			error_response('One or more activated abilities are not owned by this player.', 422);
		}

		$ability = rumble_ability_by_id($abilityId);
		if ($ability === null) {
			error_response('One or more activated abilities are not owned by this player.', 422);
		}

		$limitError = rumble_validate_ability_activation_limits($ability, [
			'alive_player_count' => $alivePlayerCount,
		]);
		if ($limitError !== null) {
			error_response($limitError, 422);
		}

		$activationCounts[$abilityId] = max(0, (int)($activationCounts[$abilityId] ?? 0)) + 1;
		if ($activationCounts[$abilityId] > max(0, (int)($ownedAbilityCounts[$abilityId] ?? 0))) {
			error_response('One or more activated abilities exceed the number of copies you own.', 422);
		}

		if (array_key_exists('ability_copy_index', $activation)) {
			$copyKey = $abilityId . '__' . (int)$activation['ability_copy_index'];
			if (isset($activationCopyKeys[$copyKey])) {
				error_response('Each owned ability copy can only be activated once per round.', 422);
			}
			$activationCopyKeys[$copyKey] = true;
			if ((int)$activation['ability_copy_index'] > max(0, (int)($ownedAbilityCounts[$abilityId] ?? 0))) {
				error_response('One or more activated ability copies are invalid.', 422);
			}
		}

		if (array_key_exists('target_user_id', $activation)) {
			$targetId = (int)$activation['target_user_id'];
			if (!isset($validAbilityTargetMap[$targetId])) {
				error_response('One or more ability activation targets are invalid.', 422);
			}
		}
	}

	$abilityEnergySpent = 0;
	foreach ($normalizedAbilityActivations as $activation) {
		try {
			$abilityEnergySpent += rumble_activation_energy_cost($activation, true);
		} catch (InvalidArgumentException $ex) {
			error_response($ex->getMessage(), 422);
		}
	}

	$energyBudget = rumble_player_round_energy_budget($currentHealth, $ownedAbilityIds);
	$attackEnergySpent = rumble_attack_energy_cost($normalizedAttacks, $ownedAbilityIds, $normalizedAbilityActivations);
	$totalEnergySpent = $attackEnergySpent + $abilityEnergySpent;
	if ($totalEnergySpent > $energyBudget) {
		error_response('Invalid order: total energy spent exceeds your round energy budget.', 422);
	}

	$defense = $currentHealth - $attackEnergySpent;
	if ($defense < 0) {
		error_response('Invalid order: defense cannot be negative.', 422);
	}

	ksort($normalizedAttacks, SORT_NUMERIC);
	$payload = [
		'attacks' => $normalizedAttacks,
		'ability_activations' => $normalizedAbilityActivations,
		'defense' => $defense,
		'energy_budget' => $energyBudget,
		'attack_energy_spent' => $attackEnergySpent,
		'ability_energy_spent' => $abilityEnergySpent,
		'total_energy_spent' => $totalEnergySpent,
	];

	$pdo = db();
	$pdo->beginTransaction();
	try {
		$deleteStmt = $pdo->prepare(
			'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
		);
		$deleteStmt->execute([
			'game_id' => $gameId,
			'user_id' => (int)$user['id'],
			'round_number' => $roundNumber,
			'action_type' => 'order',
		]);

		$insertStmt = $pdo->prepare(
			'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
			. 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
		);
		$insertStmt->execute([
			'game_id' => $gameId,
			'user_id' => (int)$user['id'],
			'action_type' => 'order',
			'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
			'round_number' => $roundNumber,
			'phase' => $phase,
			'revealed_at' => gmdate('Y-m-d H:i:s'),
		]);

		$pdo->commit();
	} catch (Throwable $ex) {
		$pdo->rollBack();
		throw $ex;
	}

	success_response([
		'submitted' => true,
		'round' => $roundNumber,
		'defense' => $defense,
		'energy_budget' => $energyBudget,
		'attack_energy_spent' => $attackEnergySpent,
		'ability_energy_spent' => $abilityEnergySpent,
		'total_energy_spent' => $totalEnergySpent,
	], 201);
}

function rumble_action_upsert_bids(int $gameId): void
{
	$user = require_user();
	$role = game_require_member_or_403((int)$user['id'], $gameId);
	if ($role === 'observer') {
		error_response('Observers cannot submit bids.', 403);
	}

	$game = game_find_by_id($gameId);
	if ($game === null) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('This endpoint is only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Bids are only allowed while game is in progress.', 409);
	}

	$stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
	$stateStmt->execute(['game_id' => $gameId]);
	$state = $stateStmt->fetch();
	$roundNumber = (int)($state['current_round'] ?? 1);
	$phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
	if ($phase !== 'bidding') {
		error_response('Bids are only allowed during bidding phase.', 409);
	}

	$ensureStmt = db()->prepare(db_upsert_sql(
		'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health) VALUES (:game_id, :user_id, 100, 100)',
		['game_id', 'user_id'],
		[
			'current_health' => 'current_health',
			'starting_health' => 'starting_health',
		]
	));
	$ensureStmt->execute([
		'game_id' => $gameId,
		'user_id' => (int)$user['id'],
	]);

	$healthStmt = db()->prepare('SELECT current_health FROM rumble_player_state WHERE game_id = :game_id AND user_id = :user_id LIMIT 1');
	$healthStmt->execute([
		'game_id' => $gameId,
		'user_id' => (int)$user['id'],
	]);
	$currentHealth = (int)($healthStmt->fetchColumn() ?: 0);
	if ($currentHealth <= 0) {
		error_response('Eliminated players cannot submit bids.', 409);
	}

	$offer = rumble_action_current_offer($gameId, $roundNumber);
	if ($offer === null) {
		error_response('No ability offer is available for this game.', 409);
	}

	$allowedOfferItems = (array)($offer['items'] ?? []);
	$allowedByKey = [];
	foreach ($allowedOfferItems as $item) {
		$offerItemKey = trim((string)($item['offer_item_key'] ?? ''));
		if ($offerItemKey === '') {
			continue;
		}
		$allowedByKey[$offerItemKey] = (string)($item['ability_id'] ?? '');
	}

	$body = json_input();
	$bidsRaw = $body['bids'] ?? [];
	if (!is_array($bidsRaw)) {
		error_response('Bids must be an object keyed by offer item.', 422);
	}

	$normalized = rumble_normalize_bid_map($bidsRaw, $allowedOfferItems);
	$totalBid = 0;
	foreach ($bidsRaw as $offerItemKeyRaw => $amountRaw) {
		$offerItemKey = trim((string)$offerItemKeyRaw);
		if ($offerItemKey === '') {
			error_response('One or more offer item keys are invalid for this offer.', 422);
		}

		if (!isset($allowedByKey[$offerItemKey]) && !in_array($offerItemKey, array_values($allowedByKey), true)) {
			error_response('One or more offer item keys are invalid for this offer.', 422);
		}

		if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
			error_response('Bid amounts must be whole non-negative numbers.', 422);
		}

		$amount = (int)$amountRaw;
		if ($amount < 0) {
			error_response('Bid amounts must be non-negative.', 422);
		}
		$totalBid += max(0, $amount);
	}

	$payload = [
		'bids' => $normalized,
		'total_bid' => $totalBid,
	];

	$pdo = db();
	$pdo->beginTransaction();
	try {
		$deleteStmt = $pdo->prepare(
			'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
		);
		$deleteStmt->execute([
			'game_id' => $gameId,
			'user_id' => (int)$user['id'],
			'round_number' => $roundNumber,
			'action_type' => 'bid',
		]);

		$insertStmt = $pdo->prepare(
			'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
			. 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
		);
		$insertStmt->execute([
			'game_id' => $gameId,
			'user_id' => (int)$user['id'],
			'action_type' => 'bid',
			'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
			'round_number' => $roundNumber,
			'phase' => 'bidding',
			'revealed_at' => null,
		]);

		$pdo->commit();
	} catch (Throwable $ex) {
		$pdo->rollBack();
		throw $ex;
	}

	rumble_action_maybe_auto_resolve_bidding($gameId, $roundNumber);

	success_response([
		'submitted' => true,
		'phase' => 'bidding',
		'round' => $roundNumber,
		'total_bid' => $totalBid,
	], 201);
}


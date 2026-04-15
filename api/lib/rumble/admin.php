<?php

// Admin utilities for Rumble (migrated from api/lib/rumble.php)

function rumble_admin_target_member(int $gameId, int $targetUserId): array
{
	$memberStmt = db()->prepare(
		'SELECT gm.role, u.username, u.is_active, rps.current_health, rps.owned_abilities_json '
		. 'FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.user_id = :user_id '
		. 'LIMIT 1'
	);
	$memberStmt->execute([
		'game_id' => $gameId,
		'user_id' => $targetUserId,
	]);
	$member = $memberStmt->fetch();
	if (!$member || (int)($member['is_active'] ?? 0) !== 1) {
		error_response('Target player not found.', 404);
	}

	if ((string)($member['role'] ?? '') === 'observer') {
		error_response('Observers cannot be modified with rumble cheat actions.', 409);
	}

	return $member;
}

function rumble_admin_action_context(int $gameId): array
{
	$stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
	$stateStmt->execute(['game_id' => $gameId]);
	$state = $stateStmt->fetch();

	return [
		'round_number' => (int)($state['current_round'] ?? 1),
		'phase' => (string)($state['phase'] ?? 'bidding'),
	];
}

function rumble_admin_log_action(int $gameId, int $actorUserId, string $actionType, array $payload, int $roundNumber, string $phase): void
{
	$auditStmt = db()->prepare(
		'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
		. 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
	);
	$auditStmt->execute([
		'game_id' => $gameId,
		'user_id' => $actorUserId,
		'action_type' => $actionType,
		'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
		'round_number' => $roundNumber,
		'phase' => $phase,
		'revealed_at' => gmdate('Y-m-d H:i:s'),
	]);
}

function rumble_admin_grant_abilities(int $gameId, int $actorUserId, int $targetUserId, array $abilityIds): array
{
	$db = db();

	$gameStmt = $db->prepare('SELECT id, owner_user_id, game_type, status FROM games WHERE id = :game_id LIMIT 1');
	$gameStmt->execute(['game_id' => $gameId]);
	$game = $gameStmt->fetch();
	if (!$game) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('Ability grants are only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Ability grants are only available while the game is in progress.', 409);
	}

	$normalizedRequestedIds = [];
	foreach ($abilityIds as $abilityId) {
		$normalizedId = rumble_canonical_ability_id((string)$abilityId);
		if ($normalizedId === '') {
			continue;
		}
		if (!rumble_ability_exists($normalizedId)) {
			error_response('Unknown rumble ability: ' . $normalizedId, 422);
		}

		$normalizedRequestedIds[] = $normalizedId;
	}

	if (count($normalizedRequestedIds) === 0) {
		error_response('Select at least one valid ability to grant.', 422);
	}

	$member = rumble_admin_target_member($gameId, $targetUserId);

	$existingOwnedIds = rumble_parse_owned_abilities(isset($member['owned_abilities_json']) ? (string)$member['owned_abilities_json'] : null);
	$addedAbilityIds = [];
	foreach ($normalizedRequestedIds as $requestedId) {
		$addedAbilityIds[] = $requestedId;
		$existingOwnedIds[] = $requestedId;
	}

	$encodedOwnedAbilities = rumble_encode_owned_abilities($existingOwnedIds);
	$finalOwnedIds = rumble_parse_owned_abilities($encodedOwnedAbilities);
	$finalOwnedAbilities = rumble_owned_abilities_public_view($finalOwnedIds);

	$actionContext = rumble_admin_action_context($gameId);
	$roundNumber = (int)$actionContext['round_number'];
	$phase = (string)$actionContext['phase'];

	$db->beginTransaction();
	try {
		$upsertStmt = $db->prepare(db_upsert_sql(
			'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health, owned_abilities_json) '
			. 'VALUES (:game_id, :user_id, 100, 100, :owned_abilities_json)',
			['game_id', 'user_id'],
			[
				'owned_abilities_json' => db_insert_value_sql('owned_abilities_json'),
				'starting_health' => 'starting_health',
			]
		));
		$upsertStmt->execute([
			'game_id' => $gameId,
			'user_id' => $targetUserId,
			'owned_abilities_json' => $encodedOwnedAbilities,
		]);

		rumble_admin_log_action($gameId, $actorUserId, 'admin_grant_abilities', [
			'target_user_id' => $targetUserId,
			'target_username' => (string)$member['username'],
			'requested_ability_ids' => $normalizedRequestedIds,
			'added_ability_ids' => $addedAbilityIds,
			'owned_ability_ids' => $finalOwnedIds,
		], $roundNumber, $phase);

		$db->commit();
	} catch (Throwable $err) {
		if ($db->inTransaction()) {
			$db->rollBack();
		}
		throw $err;
	}

	return [
		'target_user_id' => $targetUserId,
		'target_username' => (string)$member['username'],
		'added_ability_ids' => $addedAbilityIds,
		'owned_ability_ids' => $finalOwnedIds,
		'owned_abilities' => $finalOwnedAbilities,
	];
}

function rumble_admin_revoke_abilities(int $gameId, int $actorUserId, int $targetUserId, array $abilityIds): array
{
	$db = db();

	$gameStmt = $db->prepare('SELECT id, owner_user_id, game_type, status FROM games WHERE id = :game_id LIMIT 1');
	$gameStmt->execute(['game_id' => $gameId]);
	$game = $gameStmt->fetch();
	if (!$game) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('Ability revokes are only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Ability revokes are only available while the game is in progress.', 409);
	}

	$normalizedRequestedIds = [];
	foreach ($abilityIds as $abilityId) {
		$normalizedId = rumble_canonical_ability_id((string)$abilityId);
		if ($normalizedId === '') {
			continue;
		}
		if (!rumble_ability_exists($normalizedId)) {
			error_response('Unknown rumble ability: ' . $normalizedId, 422);
		}

		$normalizedRequestedIds[] = $normalizedId;
	}

	if (count($normalizedRequestedIds) === 0) {
		error_response('Select at least one valid ability to remove.', 422);
	}

	$member = rumble_admin_target_member($gameId, $targetUserId);
	$existingOwnedIds = rumble_parse_owned_abilities(isset($member['owned_abilities_json']) ? (string)$member['owned_abilities_json'] : null);
	$requestedLookup = array_fill_keys($normalizedRequestedIds, true);
	$removedAbilityIds = [];
	$remainingOwnedIds = [];
	foreach ($existingOwnedIds as $existingAbilityId) {
		if (isset($requestedLookup[$existingAbilityId])) {
			$removedAbilityIds[] = $existingAbilityId;
			continue;
		}

		$remainingOwnedIds[] = $existingAbilityId;
	}

	$encodedOwnedAbilities = rumble_encode_owned_abilities($remainingOwnedIds);
	$finalOwnedIds = rumble_parse_owned_abilities($encodedOwnedAbilities);
	$finalOwnedAbilities = rumble_owned_abilities_public_view($finalOwnedIds);
	$actionContext = rumble_admin_action_context($gameId);
	$roundNumber = (int)$actionContext['round_number'];
	$phase = (string)$actionContext['phase'];

	$db->beginTransaction();
	try {
		$upsertStmt = $db->prepare(db_upsert_sql(
			'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health, owned_abilities_json) '
			. 'VALUES (:game_id, :user_id, 100, 100, :owned_abilities_json)',
			['game_id', 'user_id'],
			[
				'owned_abilities_json' => db_insert_value_sql('owned_abilities_json'),
				'starting_health' => 'starting_health',
			]
		));
		$upsertStmt->execute([
			'game_id' => $gameId,
			'user_id' => $targetUserId,
			'owned_abilities_json' => $encodedOwnedAbilities,
		]);

		rumble_admin_log_action($gameId, $actorUserId, 'admin_revoke_abilities', [
			'target_user_id' => $targetUserId,
			'target_username' => (string)$member['username'],
			'requested_ability_ids' => $normalizedRequestedIds,
			'removed_ability_ids' => $removedAbilityIds,
			'owned_ability_ids' => $finalOwnedIds,
		], $roundNumber, $phase);

		$db->commit();
	} catch (Throwable $err) {
		if ($db->inTransaction()) {
			$db->rollBack();
		}
		throw $err;
	}

	return [
		'target_user_id' => $targetUserId,
		'target_username' => (string)$member['username'],
		'removed_ability_ids' => $removedAbilityIds,
		'owned_ability_ids' => $finalOwnedIds,
		'owned_abilities' => $finalOwnedAbilities,
	];
}

function rumble_admin_set_health(int $gameId, int $actorUserId, int $targetUserId, int $health, ?int $startingHealth = null): array
{
	$db = db();

	$gameStmt = $db->prepare('SELECT id, owner_user_id, game_type, status FROM games WHERE id = :game_id LIMIT 1');
	$gameStmt->execute(['game_id' => $gameId]);
	$game = $gameStmt->fetch();
	if (!$game) {
		error_response('Game not found.', 404);
	}

	if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
		error_response('Health changes are only available for rumble games.', 409);
	}

	if ((string)$game['status'] !== 'in_progress') {
		error_response('Health changes are only available while the game is in progress.', 409);
	}

	if ($health < 0) {
		error_response('Health must be a non-negative integer.', 422);
	}

	$member = rumble_admin_target_member($gameId, $targetUserId);
	$actionContext = rumble_admin_action_context($gameId);
	$roundNumber = (int)$actionContext['round_number'];
	$phase = (string)$actionContext['phase'];
	$previousHealth = max(0, (int)($member['current_health'] ?? 100));

	$db->beginTransaction();
	try {
		$upsertStmt = $db->prepare(db_upsert_sql(
			'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health) '
			. 'VALUES (:game_id, :user_id, :current_health, :starting_health)',
			['game_id', 'user_id'],
			[
				'current_health' => db_insert_value_sql('current_health'),
				'starting_health' => db_insert_value_sql('starting_health'),
			]
		));
		$upsertStmt->execute([
			'game_id' => $gameId,
			'user_id' => $targetUserId,
			'current_health' => $health,
			'starting_health' => $startingHealth !== null ? $startingHealth : $health,
		]);

		rumble_admin_log_action($gameId, $actorUserId, 'admin_set_health', [
			'target_user_id' => $targetUserId,
			'target_username' => (string)$member['username'],
			'previous_health' => $previousHealth,
			'health' => $health,
		], $roundNumber, $phase);

		$db->commit();
	} catch (Throwable $err) {
		if ($db->inTransaction()) {
			$db->rollBack();
		}
		throw $err;
	}

	$startingUsed = $startingHealth !== null ? $startingHealth : $health;
	return [
		'target_user_id' => $targetUserId,
		'target_username' => (string)$member['username'],
		'health' => $health,
		'starting_health' => $startingUsed,
	];
}


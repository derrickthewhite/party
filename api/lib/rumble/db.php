<?php

// DB helper wrappers for Rumble

function rumble_initialize_player_state(int $gameId): void
{
	$stmt = db()->prepare(db_upsert_sql(
		'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health, owned_abilities_json) '
		. 'SELECT gm.game_id, gm.user_id, 100, 100, :owned_abilities_json FROM game_members gm '
		. 'JOIN users u ON u.id = gm.user_id '
		. 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1',
		['game_id', 'user_id'],
		[
			'current_health' => 'current_health',
			'starting_health' => 'starting_health',
		]
	));
	$stmt->execute([
		'game_id' => $gameId,
		'observer_role' => 'observer',
		'owned_abilities_json' => json_encode([], JSON_UNESCAPED_UNICODE),
	]);
}

function rumble_fetch_offer_payload(int $gameId, int $roundNumber): array
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
		return ['ability_ids' => []];
	}

	$decoded = json_decode((string)$raw, true);
	if (!is_array($decoded)) {
		return ['ability_ids' => []];
	}

	$items = rumble_normalize_offer_items($decoded);

	return [
		'items' => $items,
		'ability_ids' => array_values(array_map(static fn (array $item): string => (string)$item['ability_id'], $items)),
	];
}


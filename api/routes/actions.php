<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/game_access.php';
require_once __DIR__ . '/../lib/game_types.php';
require_once __DIR__ . '/../lib/rumble.php';

function handle_actions_route(string $method, array $segments): void
{
    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions') {
        $gameId = (int)$segments[1];

        if ($method === 'GET') {
            actions_list($gameId);
        }

        if ($method === 'POST') {
            actions_create($gameId);
        }

        error_response('Method not allowed.', 405);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'reveal') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        actions_force_reveal((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-order') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_upsert_order((int)$segments[1]);
    }

    if (count($segments) === 5 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-order' && $segments[4] === 'cancel') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_cancel_order((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-bids') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_upsert_bids((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-ship-name') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_upsert_ship_name((int)$segments[1]);
    }

    if (count($segments) === 5 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-bids' && $segments[4] === 'cancel') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_cancel_bids((int)$segments[1]);
    }

    if (count($segments) === 5 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-bids' && $segments[4] === 'end') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_end_bidding((int)$segments[1]);
    }

    error_response('Not found.', 404);
}

function actions_list(int $gameId): void
{
    $user = require_user();
    $role = game_require_member_or_403((int)$user['id'], $gameId);

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $sinceId = 0;
    if (isset($_GET['since_id']) && ctype_digit((string)$_GET['since_id'])) {
        $sinceId = (int)$_GET['since_id'];
    }

    $stmt = db()->prepare(
        'SELECT a.id, a.action_type, a.payload, a.round_number, a.phase, a.revealed_at, a.created_at, u.id AS user_id, u.username '
        . 'FROM game_actions a '
        . 'JOIN users u ON u.id = a.user_id '
        . 'WHERE a.game_id = :game_id AND a.id > :since_id '
        . 'ORDER BY a.id ASC '
        . 'LIMIT 200'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'since_id' => $sinceId,
    ]);

    $rows = $stmt->fetchAll();
    $type = normalize_game_type((string)$game['game_type']);

    $actions = [];
    foreach ($rows as $row) {
        $isHiddenDiplomacyOrder = $type === 'diplomacy'
            && (string)$row['action_type'] === 'order'
            && $row['revealed_at'] === null;

        if ($isHiddenDiplomacyOrder) {
            continue;
        }

        $payload = json_decode((string)$row['payload'], true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $actions[] = [
            'id' => (int)$row['id'],
            'action_type' => (string)$row['action_type'],
            'payload' => $payload,
            'round_number' => (int)$row['round_number'],
            'phase' => (string)$row['phase'],
            'revealed_at' => $row['revealed_at'] !== null ? (string)$row['revealed_at'] : null,
            'created_at' => (string)$row['created_at'],
            'user' => [
                'id' => (int)$row['user_id'],
                'username' => (string)$row['username'],
            ],
        ];
    }

    $lastId = $sinceId;
    if (!empty($rows)) {
        $last = end($rows);
        $lastId = (int)$last['id'];
    }

    success_response([
        'actions' => $actions,
        'last_id' => $lastId,
        'member_role' => $role,
    ]);
}

function actions_create(int $gameId): void
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

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Game actions are only allowed while game is in progress.', 409);
    }

    $body = json_input();
    $actionType = trim((string)($body['action_type'] ?? ''));
    $payload = $body['payload'] ?? [];
    if ($actionType === '' || strlen($actionType) > 40) {
        error_response('Action type is required and must be at most 40 characters.', 422);
    }

    if (!is_array($payload)) {
        error_response('Action payload must be an object.', 422);
    }

    if (normalize_game_type((string)$game['game_type']) === 'rumble' && $actionType === 'order') {
        error_response('Use the rumble order endpoint for order submission.', 409);
    }

    $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $state = $stateStmt->fetch();

    $roundNumber = (int)($state['current_round'] ?? 1);
    $phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));

    $revealedAt = null;
    if (normalize_game_type((string)$game['game_type']) !== 'diplomacy') {
        $revealedAt = gmdate('Y-m-d H:i:s');
    }

    $insert = db()->prepare(
        'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
        . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
    );
    $insert->execute([
        'game_id' => $gameId,
        'user_id' => $user['id'],
        'action_type' => $actionType,
        'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
        'round_number' => $roundNumber,
        'phase' => $phase,
        'revealed_at' => $revealedAt,
    ]);

    if (normalize_game_type((string)$game['game_type']) === 'diplomacy' && $actionType === 'order') {
        diplomacy_maybe_auto_reveal($gameId, $roundNumber);
    }

    success_response(['created' => true], 201);
}

function actions_force_reveal(int $gameId): void
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
        error_response('Only the game owner or an admin can end the turn.', 403);
    }

    $type = normalize_game_type((string)$game['game_type']);
    if ($type !== 'diplomacy') {
        if ($type !== 'rumble') {
            error_response('Turn resolution is only available for diplomacy and rumble games.', 409);
        }

        $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
        $stateStmt->execute(['game_id' => $gameId]);
        $state = $stateStmt->fetch();
        $roundNumber = (int)($state['current_round'] ?? 1);
        $phase = (string)($state['phase'] ?? 'bidding');

        if ($phase === 'bidding') {
            $resolved = rumble_resolve_bidding_and_enter_battle($gameId, $roundNumber);
            success_response(['resolved' => true, 'phase' => 'battle', 'count' => $resolved, 'round' => $roundNumber]);
        }

        $resolvedCount = rumble_resolve_round_and_advance($gameId, $roundNumber);
        success_response(['resolved' => true, 'phase' => 'battle', 'count' => $resolvedCount, 'round' => $roundNumber]);
    }

    $stateStmt = db()->prepare('SELECT current_round FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $roundNumber = (int)($stateStmt->fetchColumn() ?: 1);

    $revealedCount = diplomacy_reveal_round_and_advance($gameId, $roundNumber);

    success_response(['revealed' => true, 'count' => $revealedCount, 'round' => $roundNumber]);
}

function rumble_upsert_order(int $gameId): void
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

    $ensureStmt = db()->prepare(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) VALUES (:game_id, :user_id, 100) '
        . 'ON DUPLICATE KEY UPDATE current_health = current_health'
    );
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
    $ownedAbilityMap = array_fill_keys($ownedAbilityIds, true);

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
        'SELECT gm.user_id FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
        . 'AND gm.user_id <> :self_user_id AND COALESCE(rps.current_health, 100) > 0'
    );
    $targetsStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
        'self_user_id' => (int)$user['id'],
    ]);
    $validTargets = array_map(static fn ($v): int => (int)$v, $targetsStmt->fetchAll(
        PDO::FETCH_COLUMN,
        0
    ));
    $validTargetMap = [];
    foreach ($validTargets as $targetId) {
        $validTargetMap[$targetId] = true;
    }

    $normalizedAttacks = [];
    $totalAttack = 0;
    foreach ($attacksRaw as $targetKey => $amountRaw) {
        if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
            error_response('Attack target ids must be integers.', 422);
        }

        $targetId = (int)$targetKey;
        if (!isset($validTargetMap[$targetId])) {
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
        $totalAttack += $amount;
    }

    foreach ($normalizedAbilityActivations as $activation) {
        $abilityId = (string)($activation['ability_id'] ?? '');
        if ($abilityId === '' || !isset($ownedAbilityMap[$abilityId])) {
            error_response('One or more activated abilities are not owned by this player.', 422);
        }

        if (array_key_exists('target_user_id', $activation)) {
            $targetId = (int)$activation['target_user_id'];
            if (!isset($validTargetMap[$targetId])) {
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
    $attackEnergySpent = $totalAttack;
    $totalEnergySpent = $attackEnergySpent + $abilityEnergySpent;
    if ($totalEnergySpent > $energyBudget) {
        error_response('Invalid order: total energy spent exceeds your round energy budget.', 422);
    }

    $defense = $currentHealth - $totalAttack;
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

function rumble_upsert_bids(int $gameId): void
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

    $ensureStmt = db()->prepare(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) VALUES (:game_id, :user_id, 100) '
        . 'ON DUPLICATE KEY UPDATE current_health = current_health'
    );
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

    $offer = rumble_current_offer($gameId, $roundNumber);
    if ($offer === null) {
        error_response('No ability offer is available for this game.', 409);
    }

    $allowed = [];
    foreach ($offer['ability_ids'] as $abilityId) {
        $allowed[$abilityId] = true;
    }

    $body = json_input();
    $bidsRaw = $body['bids'] ?? [];
    if (!is_array($bidsRaw)) {
        error_response('Bids must be an object keyed by ability id.', 422);
    }

    $normalized = [];
    $totalBid = 0;
    foreach ($bidsRaw as $abilityIdRaw => $amountRaw) {
        $abilityId = trim((string)$abilityIdRaw);
        if ($abilityId === '' || !isset($allowed[$abilityId])) {
            error_response('One or more ability ids are invalid for this offer.', 422);
        }

        if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
            error_response('Bid amounts must be whole non-negative numbers.', 422);
        }

        $amount = (int)$amountRaw;
        if ($amount < 0) {
            error_response('Bid amounts must be non-negative.', 422);
        }

        if ($amount === 0) {
            continue;
        }

        $normalized[$abilityId] = $amount;
        $totalBid += $amount;
    }

    ksort($normalized, SORT_STRING);
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

    rumble_maybe_auto_resolve_bidding($gameId, $roundNumber);

    success_response([
        'submitted' => true,
        'phase' => 'bidding',
        'round' => $roundNumber,
        'total_bid' => $totalBid,
    ], 201);
}

function rumble_upsert_ship_name(int $gameId): void
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

    $stmt = db()->prepare(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health, ship_name, owned_abilities_json) '
        . 'VALUES (:game_id, :user_id, 100, :ship_name, :owned_abilities_json) '
        . 'ON DUPLICATE KEY UPDATE ship_name = :ship_name_update'
    );
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

function rumble_cancel_bids(int $gameId): void
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

function rumble_end_bidding(int $gameId): void
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

    $resolved = rumble_resolve_bidding_and_enter_battle($gameId, $roundNumber);

    success_response([
        'resolved' => true,
        'phase' => 'battle',
        'round' => $roundNumber,
        'assigned_count' => $resolved,
    ]);
}

function rumble_maybe_auto_resolve_bidding(int $gameId, int $roundNumber): void
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

    rumble_resolve_bidding_and_enter_battle($gameId, $roundNumber);
}

function rumble_current_offer(int $gameId, int $roundNumber): ?array
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

    $idsRaw = isset($payload['ability_ids']) && is_array($payload['ability_ids']) ? $payload['ability_ids'] : [];
    $ids = [];
    $seen = [];
    foreach ($idsRaw as $idRaw) {
        $id = trim((string)$idRaw);
        if ($id === '' || isset($seen[$id]) || !rumble_ability_exists($id)) {
            continue;
        }
        $seen[$id] = true;
        $ids[] = $id;
    }

    return [
        'ability_ids' => $ids,
    ];
}

function rumble_resolve_bidding_and_enter_battle(int $gameId, int $roundNumber): int
{
    $pdo = db();

    $ensureStmt = $pdo->prepare(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) '
        . 'SELECT gm.game_id, gm.user_id, 100 FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
        . 'ON DUPLICATE KEY UPDATE current_health = current_health'
    );
    $ensureStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);

    $offer = rumble_current_offer($gameId, $roundNumber);
    if ($offer === null || empty($offer['ability_ids'])) {
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
    $ownedByUser = [];
    foreach ($playerRows as $row) {
        $userId = (int)$row['user_id'];
        $remainingHealth[$userId] = (int)$row['current_health'];
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

    $bidsByAbility = [];
    foreach ($offer['ability_ids'] as $abilityId) {
        $bidsByAbility[$abilityId] = [];
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

        $bids = isset($payload['bids']) && is_array($payload['bids']) ? $payload['bids'] : [];
        foreach ($bids as $abilityIdRaw => $amountRaw) {
            $abilityId = trim((string)$abilityIdRaw);
            if (!isset($bidsByAbility[$abilityId])) {
                continue;
            }
            if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
                continue;
            }

            $amount = (int)$amountRaw;
            if ($amount <= 0) {
                continue;
            }

            $bidsByAbility[$abilityId][$userId] = $amount;
        }
    }

    $assigned = [];
    foreach ($offer['ability_ids'] as $abilityId) {
        $abilityBids = $bidsByAbility[$abilityId] ?? [];
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
        $assigned[$abilityId] = [
            'user_id' => $winnerId,
            'bid' => $winningBid,
        ];
    }

    $pdo->beginTransaction();
    try {
        $updateStateStmt = $pdo->prepare(
            'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round) '
            . 'ON DUPLICATE KEY UPDATE phase = :phase_update'
        );
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

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    return count($assigned);
}

function rumble_cancel_order(int $gameId): void
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

function rumble_resolve_round_and_advance(int $gameId, int $roundNumber): int
{
    $pdo = db();

    $ensureStmt = $pdo->prepare(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) '
        . 'SELECT gm.game_id, gm.user_id, 100 FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
        . 'ON DUPLICATE KEY UPDATE current_health = current_health'
    );
    $ensureStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);

    $playersStmt = $pdo->prepare(
        'SELECT rps.user_id, rps.current_health, rps.owned_abilities_json FROM rumble_player_state rps '
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

    // 1) Set round stats.
    $healthByUser = [];
    $ownedAbilityIdsByUser = [];
    $ownedAbilitySetByUser = [];
    $energyBudgetByUser = [];
    $roundStartDefenseBonusByUser = [];
    $activatedDefenseBonusByUser = [];
    $untargetableByUser = [];
    $armorReductionByUser = [];
    $nimbleDodgeByUser = [];
    $focusedDefenseByUser = [];
    $reflectiveShieldByUser = [];
    $defeatRestoreHealthByUser = [];
    $roundEndUpkeepHealthLossByUser = [];
    $preRoundEffectRows = [];

    foreach ($playerRows as $row) {
        $userId = (int)$row['user_id'];
        $health = max(0, (int)$row['current_health']);
        $ownedAbilityIds = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
        $abilitySet = array_fill_keys($ownedAbilityIds, true);

        // 2) Modify round stats from passive/trigger templates.
        if (isset($abilitySet['automated_repair_systems'])) {
            $health = min(100, $health + 5);
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_heal',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'automated_repair_systems', 'amount' => 5],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
        if (isset($abilitySet['replicators'])) {
            $health += 5;
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_heal',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'replicators', 'amount' => 5],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
        if (isset($abilitySet['mcguffin_generator']) && $roundNumber === 3) {
            $health += 50;
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_heal',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'mcguffin_generator', 'amount' => 50],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }

        $healthByUser[$userId] = $health;
        $ownedAbilityIdsByUser[$userId] = $ownedAbilityIds;
        $ownedAbilitySetByUser[$userId] = $abilitySet;
        $energyBudgetByUser[$userId] = rumble_player_round_energy_budget($health, $ownedAbilityIds);

        $roundStartDefenseBonusByUser[$userId] = isset($abilitySet['shield_boosters']) ? 20 : 0;
        $activatedDefenseBonusByUser[$userId] = 0;
        $untargetableByUser[$userId] = isset($abilitySet['holoship']);
        $armorReductionByUser[$userId] = isset($abilitySet['heavy_armor']) ? 10 : (isset($abilitySet['armor']) ? 5 : 0);
        $nimbleDodgeByUser[$userId] = false;
        $focusedDefenseByUser[$userId] = [];
        $reflectiveShieldByUser[$userId] = isset($abilitySet['reflective_shield']);
        $defeatRestoreHealthByUser[$userId] = isset($abilitySet['backup_generator']) ? 30 : (isset($abilitySet['escape_pods']) ? 20 : 0);
        $roundEndUpkeepHealthLossByUser[$userId] = isset($abilitySet['holoship']) ? 5 : 0;

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

        if (($roundStartDefenseBonusByUser[$userId] ?? 0) > 0) {
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_defense',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'shield_boosters', 'defense_bonus' => (int)$roundStartDefenseBonusByUser[$userId]],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
    }

    $roundEffectRows = $preRoundEffectRows;

    $pendingRoundStartEffectsStmt = $pdo->prepare(
        'SELECT id, owner_user_id, payload FROM rumble_round_effects '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND trigger_timing = :timing AND is_resolved = 0'
    );
    $pendingRoundStartEffectsStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'timing' => 'round_start',
    ]);
    $pendingRoundStartEffects = $pendingRoundStartEffectsStmt->fetchAll();
    $roundStartEffectIdsToResolve = [];
    foreach ($pendingRoundStartEffects as $effectRow) {
        $effectId = (int)($effectRow['id'] ?? 0);
        $ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
        if ($effectId <= 0 || !isset($healthByUser[$ownerUserId])) {
            continue;
        }

        $payload = json_decode((string)($effectRow['payload'] ?? '{}'), true);
        if (!is_array($payload)) {
            $payload = [];
        }

        if ((string)($payload['effect'] ?? '') === 'cloaked_until_round_end') {
            $untargetableByUser[$ownerUserId] = true;
            $roundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $ownerUserId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:scheduled_status',
                'trigger_timing' => 'resolve',
                'payload' => ['effect' => 'cloaked_until_round_end'],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
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
    $defenseByUser = [];
    $abilityEnergySpentByUser = [];
    $attackEnergySpentByUser = [];
    $totalEnergySpentByUser = [];

    foreach ($healthByUser as $userId => $health) {
        $normalIncomingByTargetByAttacker[$userId] = [];
        $unblockableIncomingByTargetByAttacker[$userId] = [];
        $defenseByUser[$userId] = max(0, $health + (int)($roundStartDefenseBonusByUser[$userId] ?? 0));
        $abilityEnergySpentByUser[$userId] = 0;
        $attackEnergySpentByUser[$userId] = 0;
        $totalEnergySpentByUser[$userId] = 0;
    }

    // 3) Determine invalid targets and 4) receive orders.
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

        $ownedMap = array_fill_keys($ownedAbilityIdsByUser[$userId] ?? [], true);
        $energyBudget = max(0, (int)($energyBudgetByUser[$userId] ?? 0));
        $remainingEnergy = $energyBudget;

        // 5) Trigger activated abilities and apply their round effects.
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
            $effectPayload = ['ability_id' => $abilityId, 'activation' => $activation, 'cost' => $activationCost];

            if ($templateKey === 'activated_spend_with_target_policy') {
                $effectFormula = (array)($templateParams['effect_formula'] ?? []);
                $effectKind = (string)($effectFormula['kind'] ?? '');
                if ($effectKind === 'damage_constant' && $targetId > 0) {
                    $damage = max(0, (int)($effectFormula['value'] ?? 0));
                    $channel = (string)($effectFormula['channel'] ?? 'normal');
                    if ($channel === 'unblockable') {
                        $unblockableIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($unblockableIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $damage;
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
                }
            } elseif ($templateKey === 'activated_defense_mode') {
                if ($abilityId === 'shield_capacitors') {
                    $activatedDefenseBonusByUser[$userId] = max(0, (int)($activatedDefenseBonusByUser[$userId] ?? 0)) + 20;
                    $effectPayload['applied_defense_bonus'] = 20;
                } elseif ($abilityId === 'nimble_dodge') {
                    $nimbleDodgeByUser[$userId] = true;
                    $effectPayload['enabled'] = true;
                } elseif ($abilityId === 'focused_defense' && $targetId > 0) {
                    $focusedDefenseByUser[$userId][$targetId] = true;
                    $effectPayload['focused_attacker_user_id'] = $targetId;
                } elseif ($abilityId === 'cloaking_system') {
                    $roundEffectRows[] = [
                        'game_id' => $gameId,
                        'round_number' => $roundNumber + 1,
                        'owner_user_id' => $userId,
                        'target_user_id' => null,
                        'ability_instance_id' => null,
                        'effect_key' => 'status:cloaked',
                        'trigger_timing' => 'round_start',
                        'payload' => ['effect' => 'cloaked_until_round_end', 'source_ability_id' => $abilityId],
                        'is_resolved' => 0,
                        'resolved_at' => null,
                    ];
                    $effectPayload['scheduled_for_round'] = $roundNumber + 1;
                }
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

        $defenseByUser[$userId] += max(0, (int)($activatedDefenseBonusByUser[$userId] ?? 0));

        $remaining = min($health, $remainingEnergy);
        $used = 0;
        $attackableTargetCount = 0;
        $orderedTargets = array_keys($attacks);
        sort($orderedTargets, SORT_NUMERIC);
        foreach ($orderedTargets as $targetKey) {
            if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
                continue;
            }
            $targetId = (int)$targetKey;
            if (!isset($healthByUser[$targetId]) || $targetId === $userId || $healthByUser[$targetId] <= 0 || !empty($untargetableByUser[$targetId])) {
                continue;
            }
            $amountRaw = $attacks[$targetKey] ?? 0;
            if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
                continue;
            }
            if ((int)$amountRaw > 0) {
                $attackableTargetCount++;
            }
        }
        $singleAttackBonusApplies = isset($ownedMap['death_ray']) && $attackableTargetCount === 1;

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
            if (isset($ownedMap['heavy_guns'])) {
                $attackDamage += 10;
            }
            if ($singleAttackBonusApplies) {
                $attackDamage = (int)floor($attackDamage * 1.5);
            }

            if (!empty($focusedDefenseByUser[$targetId][$userId])) {
                $attackDamage = (int)floor($attackDamage / 2);
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

    // 6) Calculate decreases in health and effects that carry to next round.
    foreach ($normalIncomingByTargetByAttacker as $targetId => $attackerMap) {
        if (empty($attackerMap)) {
            continue;
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
    }

    $nextHealthByUser = [];
    $retaliationDamageByUser = [];
    foreach ($healthByUser as $userId => $health) {
        $retaliationDamageByUser[$userId] = 0;
    }

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

        foreach ($normalByAttacker as $attackerId => $amount) {
            $normalAmount = max(0, (int)$amount);
            if ($normalAmount <= 0) {
                continue;
            }

            $absorbed = min($remainingDefense, $normalAmount);
            $remainingDefense -= $absorbed;
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
            if (!empty($reflectiveShieldByUser[$userId]) && isset($retaliationDamageByUser[(int)$attackerId])) {
                $retaliationDamageByUser[(int)$attackerId] += (int)floor(max(0, (int)$amount) / 2);
            }
        }

        $nextHealthByUser[$userId] = max(0, $health - $damage);

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
                'unblockable_incoming' => $unblockableIncomingTotal,
                'defense_available' => max(0, (int)($defenseByUser[$userId] ?? 0)),
                'final_damage' => $damage,
                'next_health' => $nextHealthByUser[$userId],
            ],
            'is_resolved' => 1,
            'resolved_at' => gmdate('Y-m-d H:i:s'),
        ];
    }

    foreach ($retaliationDamageByUser as $userId => $retaliationDamage) {
        if (!isset($nextHealthByUser[$userId]) || $retaliationDamage <= 0) {
            continue;
        }
        $nextHealthByUser[$userId] = max(0, (int)$nextHealthByUser[$userId] - $retaliationDamage);
    }

    foreach ($nextHealthByUser as $userId => $nextHealth) {
        $upkeepLoss = max(0, (int)($roundEndUpkeepHealthLossByUser[$userId] ?? 0));
        if ($upkeepLoss > 0 && $nextHealth > 0) {
            $nextHealthByUser[$userId] = max(0, $nextHealth - $upkeepLoss);
            $roundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step7:upkeep_cost',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'holoship', 'health_loss' => $upkeepLoss],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
    }

    foreach ($nextHealthByUser as $userId => $nextHealth) {
        if ($nextHealth > 0) {
            continue;
        }
        $restoreHealth = max(0, (int)($defeatRestoreHealthByUser[$userId] ?? 0));
        if ($restoreHealth <= 0) {
            continue;
        }

        $nextHealthByUser[$userId] = $restoreHealth;
        if (!empty($ownedAbilitySetByUser[$userId]['backup_generator'])) {
            unset($ownedAbilitySetByUser[$userId]['backup_generator']);
        } elseif (!empty($ownedAbilitySetByUser[$userId]['escape_pods'])) {
            unset($ownedAbilitySetByUser[$userId]['escape_pods']);
        }

        $ownedAbilityIdsByUser[$userId] = array_values(array_keys($ownedAbilitySetByUser[$userId]));
        sort($ownedAbilityIdsByUser[$userId], SORT_STRING);

        $roundEffectRows[] = [
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'owner_user_id' => $userId,
            'target_user_id' => null,
            'ability_instance_id' => null,
            'effect_key' => 'trigger:on_defeat_restore',
            'trigger_timing' => 'resolve',
            'payload' => ['restored_health' => $restoreHealth],
            'is_resolved' => 1,
            'resolved_at' => gmdate('Y-m-d H:i:s'),
        ];
    }

    // 7) Finish the round.
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

        $stateStmt = $pdo->prepare(
            'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round) '
            . 'ON DUPLICATE KEY UPDATE current_round = GREATEST(current_round, :next_round), phase = :phase_update'
        );
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => 'battle',
            'current_round' => $roundNumber,
            'next_round' => $roundNumber + 1,
            'phase_update' => 'battle',
        ]);

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    return count($orderRows);
}

function diplomacy_maybe_auto_reveal(int $gameId, int $roundNumber): void
{
    $participantsStmt = db()->prepare(
        'SELECT COUNT(*) FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
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
        'action_type' => 'order',
    ]);
    $submittedCount = (int)$submittedStmt->fetchColumn();

    if ($submittedCount < $participantCount) {
        return;
    }

    diplomacy_reveal_round_and_advance($gameId, $roundNumber);
}

function diplomacy_reveal_round_and_advance(int $gameId, int $roundNumber): int
{
    $pendingStmt = db()->prepare(
        'SELECT COUNT(*) FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type AND revealed_at IS NULL'
    );
    $pendingStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'order',
    ]);
    $pendingCount = (int)$pendingStmt->fetchColumn();

    if ($pendingCount <= 0) {
        return 0;
    }

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $revealStmt = $pdo->prepare(
            'UPDATE game_actions '
            . 'SET revealed_at = NOW() '
            . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type AND revealed_at IS NULL'
        );
        $revealStmt->execute([
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'action_type' => 'order',
        ]);
        $updated = $revealStmt->rowCount();

        $stateStmt = $pdo->prepare(
            'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round) '
            . 'ON DUPLICATE KEY UPDATE current_round = GREATEST(current_round, :next_round), phase = :phase_update'
        );
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => 'orders',
            'current_round' => $roundNumber,
            'next_round' => $roundNumber + 1,
            'phase_update' => 'orders',
        ]);

        $pdo->commit();
        return $updated;
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }
}

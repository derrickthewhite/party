<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/game_access.php';
require_once __DIR__ . '/../lib/game_types.php';

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

        $stateStmt = db()->prepare('SELECT current_round FROM game_state WHERE game_id = :game_id LIMIT 1');
        $stateStmt->execute(['game_id' => $gameId]);
        $roundNumber = (int)($stateStmt->fetchColumn() ?: 1);

        $resolvedCount = rumble_resolve_round_and_advance($gameId, $roundNumber);
        success_response(['resolved' => true, 'count' => $resolvedCount, 'round' => $roundNumber]);
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
        error_response('Eliminated players cannot submit orders.', 409);
    }

    $body = json_input();
    $attacksRaw = $body['attacks'] ?? [];
    if (!is_array($attacksRaw)) {
        error_response('Attacks must be an object keyed by target user id.', 422);
    }

    $targetsStmt = db()->prepare(
        'SELECT gm.user_id FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 AND gm.user_id <> :self_user_id'
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

    $defense = $currentHealth - $totalAttack;
    if ($defense < 0) {
        error_response('Invalid order: defense cannot be negative.', 422);
    }

    ksort($normalizedAttacks, SORT_NUMERIC);
    $payload = [
        'attacks' => $normalizedAttacks,
        'defense' => $defense,
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
    ], 201);
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

    $stateStmt = db()->prepare('SELECT current_round FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $roundNumber = (int)($stateStmt->fetchColumn() ?: 1);

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
        'SELECT rps.user_id, rps.current_health FROM rumble_player_state rps '
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

    $healthByUser = [];
    foreach ($playerRows as $row) {
        $healthByUser[(int)$row['user_id']] = max(0, (int)$row['current_health']);
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

    $incomingByUser = [];
    $defenseByUser = [];
    foreach ($healthByUser as $userId => $health) {
        $incomingByUser[$userId] = 0;
        $defenseByUser[$userId] = $health;
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

        $remaining = $health;
        $used = 0;
        $orderedTargets = array_keys($attacks);
        sort($orderedTargets, SORT_NUMERIC);
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

            $incomingByUser[$targetId] += $spend;
            $used += $spend;
            $remaining -= $spend;
        }

        $defenseByUser[$userId] = max(0, $health - $used);
    }

    $nextHealthByUser = [];
    foreach ($healthByUser as $userId => $health) {
        if ($health <= 0) {
            $nextHealthByUser[$userId] = 0;
            continue;
        }

        $damage = max(0, $incomingByUser[$userId] - $defenseByUser[$userId]);
        $nextHealthByUser[$userId] = max(0, $health - $damage);
    }

    $pdo->beginTransaction();
    try {
        $updateHealthStmt = $pdo->prepare(
            'UPDATE rumble_player_state SET current_health = :current_health WHERE game_id = :game_id AND user_id = :user_id'
        );
        foreach ($nextHealthByUser as $userId => $nextHealth) {
            $updateHealthStmt->execute([
                'current_health' => $nextHealth,
                'game_id' => $gameId,
                'user_id' => $userId,
            ]);
        }

        $stateStmt = $pdo->prepare(
            'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round) '
            . 'ON DUPLICATE KEY UPDATE current_round = GREATEST(current_round, :next_round), phase = :phase_update'
        );
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => 'bidding',
            'current_round' => $roundNumber,
            'next_round' => $roundNumber + 1,
            'phase_update' => 'bidding',
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

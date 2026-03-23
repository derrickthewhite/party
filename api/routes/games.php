<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/game_access.php';
require_once __DIR__ . '/../lib/game_types.php';

function handle_games_route(string $method, array $segments): void
{
    if (count($segments) === 1 && $segments[0] === 'games') {
        if ($method === 'GET') {
            games_list();
        }
        if ($method === 'POST') {
            games_create();
        }
        error_response('Method not allowed.', 405);
    }

    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'join') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }
        games_join((int)$segments[1]);
    }

    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'observe') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }
        games_observe((int)$segments[1]);
    }

    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'start') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }
        games_start((int)$segments[1]);
    }

    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'end') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }
        games_end((int)$segments[1]);
    }

    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'delete') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }
        games_delete((int)$segments[1]);
    }

    if (count($segments) === 2 && $segments[0] === 'games' && ctype_digit($segments[1])) {
        if ($method !== 'GET') {
            error_response('Method not allowed.', 405);
        }
        games_detail((int)$segments[1]);
    }

    error_response('Not found.', 404);
}

function games_list(): void
{
        $user = require_user();

    $sql = <<<SQL
SELECT
  g.id,
    g.owner_user_id,
  g.title,
  g.game_type,
  g.status,
  g.created_at,
    gs.phase,
    gs.current_round,
  u.username AS owner_username,
    COUNT(DISTINCT gm.user_id) AS member_count,
    SUM(CASE WHEN gm.role = 'observer' THEN 1 ELSE 0 END) AS observer_count,
    SUM(CASE WHEN gm.role <> 'observer' THEN 1 ELSE 0 END) AS player_count
FROM games g
JOIN users u ON u.id = g.owner_user_id
LEFT JOIN game_state gs ON gs.game_id = g.id
LEFT JOIN game_members gm ON gm.game_id = g.id
GROUP BY g.id, g.owner_user_id, g.title, g.game_type, g.status, g.created_at, gs.phase, gs.current_round, u.username
ORDER BY g.created_at DESC
LIMIT 100
SQL;

    $rows = db()->query($sql)->fetchAll();

    $gameIds = array_map(static fn (array $row): int => (int)$row['id'], $rows);
    $membersByGame = games_members_by_game($gameIds);

    $games = array_map(static function (array $row) use ($membersByGame, $user): array {
        $gameId = (int)$row['id'];
        $members = $membersByGame[$gameId] ?? [];
        $memberRole = null;
        foreach ($members as $member) {
            if ((int)$member['id'] === (int)$user['id']) {
                $memberRole = (string)$member['role'];
                break;
            }
        }

        $permissions = game_permissions_for_user([
            'owner_user_id' => (int)$row['owner_user_id'],
            'status' => (string)$row['status'],
        ], $user, $memberRole);

        return [
            'id' => $gameId,
            'title' => (string)$row['title'],
            'game_type' => (string)$row['game_type'],
            'status' => (string)$row['status'],
            'created_at' => (string)$row['created_at'],
            'owner_username' => (string)$row['owner_username'],
            'phase' => (string)($row['phase'] ?? default_phase_for_game_type((string)$row['game_type'])),
            'current_round' => (int)($row['current_round'] ?? 1),
            'member_count' => (int)$row['member_count'],
            'observer_count' => (int)($row['observer_count'] ?? 0),
            'player_count' => (int)($row['player_count'] ?? 0),
            'members' => $members,
            'is_member' => $memberRole !== null,
            'member_role' => $memberRole,
            'permissions' => $permissions,
        ];
    }, $rows);

    success_response(['games' => $games]);
}

function games_members_by_game(array $gameIds): array
{
    if (empty($gameIds)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($gameIds), '?'));
    $stmt = db()->prepare(
        'SELECT gm.game_id, gm.user_id, gm.role, u.username '
        . 'FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id IN (' . $placeholders . ') '
        . 'ORDER BY gm.game_id ASC, gm.joined_at ASC'
    );
    $stmt->execute($gameIds);
    $rows = $stmt->fetchAll();

    $map = [];
    foreach ($rows as $row) {
        $gameId = (int)$row['game_id'];
        if (!isset($map[$gameId])) {
            $map[$gameId] = [];
        }

        $map[$gameId][] = [
            'id' => (int)$row['user_id'],
            'username' => (string)$row['username'],
            'role' => (string)$row['role'],
        ];
    }

    return $map;
}

function games_create(): void
{
    $user = require_user();
    $body = json_input();

    $title = trim((string)($body['title'] ?? ''));
    $gameType = normalize_game_type((string)($body['game_type'] ?? 'chat'));

    if ($title === '' || strlen($title) > 100) {
        error_response('Game title is required and must be at most 100 characters.', 422);
    }

    if (!validate_game_type($gameType) || strlen($gameType) > 60) {
        error_response('Unsupported game type.', 422);
    }

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $createStmt = $pdo->prepare('INSERT INTO games (owner_user_id, title, game_type) VALUES (:owner_user_id, :title, :game_type)');
        $createStmt->execute([
            'owner_user_id' => $user['id'],
            'title' => $title,
            'game_type' => $gameType,
        ]);

        $gameId = (int)$pdo->lastInsertId();

        $memberStmt = $pdo->prepare('INSERT INTO game_members (game_id, user_id, role) VALUES (:game_id, :user_id, :role)');
        $memberStmt->execute([
            'game_id' => $gameId,
            'user_id' => $user['id'],
            'role' => 'owner',
        ]);

        $stateStmt = $pdo->prepare('INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :round_number)');
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => default_phase_for_game_type($gameType),
            'round_number' => 1,
        ]);

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    success_response([
        'game' => [
            'id' => $gameId,
            'title' => $title,
            'game_type' => $gameType,
            'status' => 'open',
        ],
    ], 201);
}

function games_join(int $gameId): void
{
    $user = require_user();

    $game = game_find_by_id($gameId);

    if (!$game) {
        error_response('Game not found.', 404);
    }

    if ((string)$game['status'] !== 'open') {
        error_response('Game is not joinable.', 409);
    }

    $stmt = db()->prepare(
        'INSERT INTO game_members (game_id, user_id, role) VALUES (:game_id, :user_id, :role) '
        . 'ON DUPLICATE KEY UPDATE role = CASE WHEN role = :owner_role THEN role ELSE :player_role END'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $user['id'],
        'role' => 'player',
        'owner_role' => 'owner',
        'player_role' => 'player',
    ]);

    if (normalize_game_type((string)$game['game_type']) === 'rumble') {
        $stateStmt = db()->prepare(
            'INSERT INTO rumble_player_state (game_id, user_id, current_health) VALUES (:game_id, :user_id, 100) '
            . 'ON DUPLICATE KEY UPDATE current_health = current_health'
        );
        $stateStmt->execute([
            'game_id' => $gameId,
            'user_id' => (int)$user['id'],
        ]);
    }

    success_response(['joined' => true, 'game_id' => $gameId, 'role' => 'player']);
}

function games_observe(int $gameId): void
{
    $user = require_user();

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $existingRole = game_member_role((int)$user['id'], $gameId);
    if ($existingRole !== null) {
        success_response(['joined' => true, 'game_id' => $gameId, 'role' => $existingRole]);
    }

    $stmt = db()->prepare('INSERT INTO game_members (game_id, user_id, role) VALUES (:game_id, :user_id, :role)');
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $user['id'],
        'role' => 'observer',
    ]);

    success_response(['joined' => true, 'game_id' => $gameId, 'role' => 'observer']);
}

function games_start(int $gameId): void
{
    $user = require_user();

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $isOwner = (int)$game['owner_user_id'] === (int)$user['id'];
    $isAdmin = (int)($user['is_admin'] ?? 0) === 1;
    if (!$isOwner && !$isAdmin) {
        error_response('Only the game owner or an admin can start the game.', 403);
    }

    if ((string)$game['status'] !== 'open') {
        error_response('Only open games can be started.', 409);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $statusStmt = $pdo->prepare('UPDATE games SET status = :status WHERE id = :id');
        $statusStmt->execute([
            'status' => 'in_progress',
            'id' => $gameId,
        ]);

        $stateStmt = $pdo->prepare(
            'INSERT INTO game_state (game_id, phase, current_round, started_at, ended_at) '
            . 'VALUES (:game_id, :phase, :round_number, NOW(), NULL) '
            . 'ON DUPLICATE KEY UPDATE started_at = NOW(), ended_at = NULL, phase = :phase_update'
        );
        $phase = default_phase_for_game_type((string)$game['game_type']);
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => $phase,
            'round_number' => 1,
            'phase_update' => $phase,
        ]);

        if (normalize_game_type((string)$game['game_type']) === 'mafia') {
            mafia_assign_roles_if_missing($gameId);
        }

        if (normalize_game_type((string)$game['game_type']) === 'rumble') {
            rumble_initialize_player_state($gameId);
        }

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    success_response(['started' => true, 'game_id' => $gameId]);
}

function games_end(int $gameId): void
{
    $user = require_user();

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $isOwner = (int)$game['owner_user_id'] === (int)$user['id'];
    $isAdmin = (int)($user['is_admin'] ?? 0) === 1;
    if (!$isOwner && !$isAdmin) {
        error_response('Only the game owner or an admin can end the game.', 403);
    }

    if ((string)$game['status'] === 'closed') {
        error_response('Game is already ended.', 409);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $statusStmt = $pdo->prepare('UPDATE games SET status = :status WHERE id = :id');
        $statusStmt->execute([
            'status' => 'closed',
            'id' => $gameId,
        ]);

        $stateStmt = $pdo->prepare(
            'INSERT INTO game_state (game_id, phase, current_round, ended_at) '
            . 'VALUES (:game_id, :phase, :round_number, NOW()) '
            . 'ON DUPLICATE KEY UPDATE ended_at = NOW()'
        );
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => default_phase_for_game_type((string)$game['game_type']),
            'round_number' => 1,
        ]);

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    success_response(['ended' => true, 'game_id' => $gameId]);
}

function games_delete(int $gameId): void
{
    $user = require_user();

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $isOwner = (int)$game['owner_user_id'] === (int)$user['id'];
    $isAdmin = (int)($user['is_admin'] ?? 0) === 1;
    if (!$isOwner && !$isAdmin) {
        error_response('Only the game owner or an admin can delete this game.', 403);
    }

    $stmt = db()->prepare('DELETE FROM games WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $gameId]);

    success_response(['deleted' => true, 'game_id' => $gameId]);
}

function games_detail(int $gameId): void
{
    $user = require_user();

    $stmt = db()->prepare(
        'SELECT g.id, g.owner_user_id, g.title, g.game_type, g.status, g.created_at, u.username AS owner_username, '
        . 'gs.phase, gs.current_round '
        . 'FROM games g '
        . 'JOIN users u ON u.id = g.owner_user_id '
        . 'LEFT JOIN game_state gs ON gs.game_id = g.id '
        . 'WHERE g.id = :id LIMIT 1'
    );
    $stmt->execute(['id' => $gameId]);
    $game = $stmt->fetch();

    if (!$game) {
        error_response('Game not found.', 404);
    }

    $memberRole = game_member_role((int)$user['id'], $gameId);
    $permissions = game_permissions_for_user($game, $user, $memberRole);

    $orderProgress = null;
    if (normalize_game_type((string)$game['game_type']) === 'diplomacy') {
        $roundNumber = (int)($game['current_round'] ?? 1);

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

        $orderProgress = [
            'round_number' => $roundNumber,
            'submitted_count' => $submittedCount,
            'participant_count' => $participantCount,
        ];
    }

    $rumbleProgress = null;
    if (normalize_game_type((string)$game['game_type']) === 'rumble') {
        $roundNumber = (int)($game['current_round'] ?? 1);

        rumble_initialize_player_state($gameId);

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

        $playersStmt = db()->prepare(
            'SELECT gm.user_id, u.username, COALESCE(rps.current_health, 100) AS current_health, gm.role '
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
        foreach ($playersStmt->fetchAll() as $row) {
            $players[] = [
                'user_id' => (int)$row['user_id'],
                'username' => (string)$row['username'],
                'health' => max(0, (int)$row['current_health']),
                'is_self' => (int)$row['user_id'] === (int)$user['id'],
                'is_defeated' => (int)$row['current_health'] <= 0,
                'member_role' => (string)$row['role'],
            ];
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
                $currentOrder = [
                    'attacks' => $normalizedAttacks,
                    'defense' => max(0, (int)$defense),
                ];
            }
        }

        $previousRound = max(0, $roundNumber - 1);
        $previousOrders = [];
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
                    'defense' => max(0, (int)($decoded['defense'] ?? 0)),
                ];
            }
        }

        $rumbleProgress = [
            'round_number' => $roundNumber,
            'submitted_count' => $submittedCount,
            'participant_count' => $participantCount,
            'players' => $players,
            'current_order' => $currentOrder,
            'previous_round_orders' => $previousOrders,
        ];
    }

    success_response([
        'game' => [
            'id' => (int)$game['id'],
            'title' => (string)$game['title'],
            'game_type' => (string)$game['game_type'],
            'status' => (string)$game['status'],
            'created_at' => (string)$game['created_at'],
            'owner_username' => (string)$game['owner_username'],
            'phase' => (string)($game['phase'] ?? default_phase_for_game_type((string)$game['game_type'])),
            'current_round' => (int)($game['current_round'] ?? 1),
            'is_member' => $memberRole !== null,
            'member_role' => $memberRole,
            'permissions' => $permissions,
            'diplomacy_order_progress' => $orderProgress,
            'rumble_turn_progress' => $rumbleProgress,
        ],
    ]);
}

function rumble_initialize_player_state(int $gameId): void
{
    $stmt = db()->prepare(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) '
        . 'SELECT gm.game_id, gm.user_id, 100 FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
        . 'ON DUPLICATE KEY UPDATE current_health = current_health'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
}

function mafia_assign_roles_if_missing(int $gameId): void
{
    $existsStmt = db()->prepare(
        'SELECT COUNT(*) FROM game_roles WHERE game_id = :game_id AND role_key = :role_key'
    );
    $existsStmt->execute([
        'game_id' => $gameId,
        'role_key' => 'mafia',
    ]);

    if ((int)$existsStmt->fetchColumn() > 0) {
        return;
    }

    $membersStmt = db()->prepare(
        'SELECT user_id FROM game_members WHERE game_id = :game_id AND role <> :observer_role ORDER BY user_id ASC'
    );
    $membersStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $memberIds = array_map(static fn (array $row): int => (int)$row['user_id'], $membersStmt->fetchAll());
    if (empty($memberIds)) {
        return;
    }

    $scored = [];
    foreach ($memberIds as $memberId) {
        $score = hash('sha256', 'v1:mafia-assign:game:' . $gameId . ':user:' . $memberId);
        $scored[] = [
            'user_id' => $memberId,
            'score' => $score,
        ];
    }

    usort($scored, static function (array $a, array $b): int {
        return strcmp($a['score'], $b['score']);
    });

    $mafiaCount = max(1, (int)floor(count($memberIds) / 3));
    $selected = array_slice($scored, 0, $mafiaCount);

    $insertStmt = db()->prepare(
        'INSERT IGNORE INTO game_roles (game_id, user_id, role_key, is_hidden) VALUES (:game_id, :user_id, :role_key, :is_hidden)'
    );
    foreach ($selected as $row) {
        $insertStmt->execute([
            'game_id' => $gameId,
            'user_id' => (int)$row['user_id'],
            'role_key' => 'mafia',
            'is_hidden' => 1,
        ]);
    }
}

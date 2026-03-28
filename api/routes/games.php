<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/game_access.php';
require_once __DIR__ . '/../lib/game_handlers.php';
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

    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'leave') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }
        games_leave((int)$segments[1]);
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

    $stmt = db()->prepare(db_upsert_sql(
        'INSERT INTO game_members (game_id, user_id, role) VALUES (:game_id, :user_id, :role)',
        ['game_id', 'user_id'],
        [
            'role' => 'CASE WHEN role = :owner_role THEN role ELSE :player_role END',
        ]
    ));
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $user['id'],
        'role' => 'player',
        'owner_role' => 'owner',
        'player_role' => 'player',
    ]);

    game_handler_after_join((string)$game['game_type'], $gameId, (int)$user['id']);

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

        $stateStmt = $pdo->prepare(db_upsert_sql(
            'INSERT INTO game_state (game_id, phase, current_round, started_at, ended_at) '
            . 'VALUES (:game_id, :phase, :round_number, ' . db_now_sql() . ', NULL)',
            ['game_id'],
            [
                'started_at' => db_now_sql(),
                'ended_at' => 'NULL',
                'phase' => ':phase_update',
            ]
        ));
        $phase = default_phase_for_game_type((string)$game['game_type']);
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => $phase,
            'round_number' => 1,
            'phase_update' => $phase,
        ]);

        game_handler_after_start((string)$game['game_type'], $gameId, (int)$user['id']);

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

        $stateStmt = $pdo->prepare(db_upsert_sql(
            'INSERT INTO game_state (game_id, phase, current_round, ended_at) '
            . 'VALUES (:game_id, :phase, :round_number, ' . db_now_sql() . ')',
            ['game_id'],
            [
                'ended_at' => db_now_sql(),
            ]
        ));
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

function games_leave(int $gameId): void
{
    $user = require_user();

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $memberRole = game_member_role((int)$user['id'], $gameId);
    if ($memberRole === null) {
        error_response('You are not a member of this game.', 403);
    }

    if ((string)$game['status'] !== 'open') {
        error_response('You can only leave games that have not started.', 409);
    }

    if ($memberRole === 'owner') {
        error_response('Game owner cannot leave. Delete the game instead.', 403);
    }

    $stmt = db()->prepare('DELETE FROM game_members WHERE game_id = :game_id AND user_id = :user_id LIMIT 1');
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
    ]);

    success_response([
        'left' => true,
        'game_id' => $gameId,
    ]);
}

function games_detail(int $gameId): void
{
    $user = require_user();
    $stage = 'games_detail.load_game';

    try {
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

        $stage = 'games_detail.build_detail_payload';
        $detailPayload = array_merge(
            game_detail_payload_defaults(),
            game_handler_build_detail_payload((string)$game['game_type'], $gameId, $game, $user)
        );

        $stage = 'games_detail.refresh_game';
        $refreshStmt = db()->prepare(
            'SELECT g.id, g.owner_user_id, g.title, g.game_type, g.status, g.created_at, u.username AS owner_username, '
            . 'gs.phase, gs.current_round '
            . 'FROM games g '
            . 'JOIN users u ON u.id = g.owner_user_id '
            . 'LEFT JOIN game_state gs ON gs.game_id = g.id '
            . 'WHERE g.id = :id LIMIT 1'
        );
        $refreshStmt->execute(['id' => $gameId]);
        $refreshedGame = $refreshStmt->fetch();
        if ($refreshedGame) {
            $game = $refreshedGame;
        }

        $stage = 'games_detail.members';
        $memberRole = game_member_role((int)$user['id'], $gameId);
        $permissions = game_permissions_for_user($game, $user, $memberRole);
        $membersByGame = games_members_by_game([$gameId]);
        $members = $membersByGame[$gameId] ?? [];
        $observerCount = 0;
        $playerCount = 0;
        foreach ($members as $member) {
            if ((string)$member['role'] === 'observer') {
                $observerCount += 1;
            } else {
                $playerCount += 1;
            }
        }

        success_response([
            'game' => [
                'id' => (int)$game['id'],
				'owner_user_id' => (int)$game['owner_user_id'],
                'title' => (string)$game['title'],
                'game_type' => (string)$game['game_type'],
                'status' => (string)$game['status'],
                'created_at' => (string)$game['created_at'],
                'owner_username' => (string)$game['owner_username'],
                'phase' => (string)($game['phase'] ?? default_phase_for_game_type((string)$game['game_type'])),
                'current_round' => (int)($game['current_round'] ?? 1),
				'member_count' => count($members),
				'observer_count' => $observerCount,
				'player_count' => $playerCount,
				'members' => $members,
                'is_member' => $memberRole !== null,
                'member_role' => $memberRole,
                'permissions' => $permissions,
                'mafia_state' => $detailPayload['mafia_state'],
                'diplomacy_order_progress' => $detailPayload['diplomacy_order_progress'],
                'rumble_turn_progress' => $detailPayload['rumble_turn_progress'],
                'final_standings' => $detailPayload['final_standings'],
            ],
        ]);
    } catch (Throwable $ex) {
        if (isset($game) && is_array($game) && normalize_game_type((string)($game['game_type'] ?? '')) === 'mafia') {
            mafia_error_response('Unable to load mafia game detail.', 500, $stage, $ex, [
                'game_id' => $gameId,
                'viewer_user_id' => (int)($user['id'] ?? 0),
            ]);
        }

        throw $ex;
    }
}

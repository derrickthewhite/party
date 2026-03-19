<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/auth.php';

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
    require_user();

    $sql = <<<SQL
SELECT
  g.id,
  g.title,
  g.game_type,
  g.status,
  g.created_at,
  u.username AS owner_username,
  COUNT(DISTINCT gm.user_id) AS member_count
FROM games g
JOIN users u ON u.id = g.owner_user_id
LEFT JOIN game_members gm ON gm.game_id = g.id
GROUP BY g.id, g.title, g.game_type, g.status, g.created_at, u.username
ORDER BY g.created_at DESC
LIMIT 100
SQL;

    $rows = db()->query($sql)->fetchAll();
    $games = array_map(static function (array $row): array {
        return [
            'id' => (int)$row['id'],
            'title' => (string)$row['title'],
            'game_type' => (string)$row['game_type'],
            'status' => (string)$row['status'],
            'created_at' => (string)$row['created_at'],
            'owner_username' => (string)$row['owner_username'],
            'member_count' => (int)$row['member_count'],
        ];
    }, $rows);

    success_response(['games' => $games]);
}

function games_create(): void
{
    $user = require_user();
    $body = json_input();

    $title = trim((string)($body['title'] ?? ''));
    $gameType = trim((string)($body['game_type'] ?? 'generic'));

    if ($title === '' || strlen($title) > 100) {
        error_response('Game title is required and must be at most 100 characters.', 422);
    }

    if ($gameType === '' || strlen($gameType) > 60) {
        error_response('Game type must be at most 60 characters.', 422);
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

    $existsStmt = db()->prepare('SELECT id, status FROM games WHERE id = :id LIMIT 1');
    $existsStmt->execute(['id' => $gameId]);
    $game = $existsStmt->fetch();

    if (!$game) {
        error_response('Game not found.', 404);
    }

    if ((string)$game['status'] !== 'open' && (string)$game['status'] !== 'in_progress') {
        error_response('Game is not joinable.', 409);
    }

    $stmt = db()->prepare('INSERT IGNORE INTO game_members (game_id, user_id, role) VALUES (:game_id, :user_id, :role)');
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $user['id'],
        'role' => 'player',
    ]);

    success_response(['joined' => true, 'game_id' => $gameId]);
}

function games_detail(int $gameId): void
{
    $user = require_user();

    $stmt = db()->prepare(
        'SELECT g.id, g.title, g.game_type, g.status, g.created_at, u.username AS owner_username '
        . 'FROM games g JOIN users u ON u.id = g.owner_user_id WHERE g.id = :id LIMIT 1'
    );
    $stmt->execute(['id' => $gameId]);
    $game = $stmt->fetch();

    if (!$game) {
        error_response('Game not found.', 404);
    }

    $isMember = user_is_game_member((int)$user['id'], $gameId);

    success_response([
        'game' => [
            'id' => (int)$game['id'],
            'title' => (string)$game['title'],
            'game_type' => (string)$game['game_type'],
            'status' => (string)$game['status'],
            'created_at' => (string)$game['created_at'],
            'owner_username' => (string)$game['owner_username'],
            'is_member' => $isMember,
        ],
    ]);
}

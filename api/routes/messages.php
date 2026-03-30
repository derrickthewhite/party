<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/game_access.php';
require_once __DIR__ . '/../lib/game_icons.php';

function handle_messages_route(string $method, array $segments): void
{
    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'messages') {
        $gameId = (int)$segments[1];

        if ($method === 'GET') {
            messages_list($gameId);
        }

        if ($method === 'POST') {
            messages_create($gameId);
        }

        error_response('Method not allowed.', 405);
    }

    error_response('Not found.', 404);
}

function messages_list(int $gameId): void
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

    game_assign_missing_member_icons($gameId);

    $stmt = db()->prepare(
        'SELECT m.id, m.body, m.created_at, u.id AS user_id, u.username, ' . game_member_icon_select_sql('gm', 'icon_key') . ' '
        . 'FROM game_messages m '
        . 'JOIN users u ON u.id = m.user_id '
        . 'LEFT JOIN game_members gm ON gm.game_id = m.game_id AND gm.user_id = m.user_id '
        . 'WHERE m.game_id = :game_id AND m.id > :since_id '
        . 'ORDER BY m.id ASC '
        . 'LIMIT 200'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'since_id' => $sinceId,
    ]);

    $rows = $stmt->fetchAll();

    $messages = array_map(static function (array $row): array {
        return [
            'id' => (int)$row['id'],
            'body' => (string)$row['body'],
            'created_at' => (string)$row['created_at'],
            'user' => [
                'id' => (int)$row['user_id'],
                'username' => (string)$row['username'],
                'icon_key' => game_normalize_icon_key($row['icon_key'] ?? null),
            ],
        ];
    }, $rows);

    $lastId = $sinceId;
    if (!empty($messages)) {
        $last = end($messages);
        $lastId = (int)$last['id'];
    }

    success_response([
        'messages' => $messages,
        'last_id' => $lastId,
        'member_role' => $role,
    ]);
}

function messages_create(int $gameId): void
{
    $user = require_user();

    $role = game_require_member_or_403((int)$user['id'], $gameId);
    if ($role === 'observer') {
        error_response('Observers cannot send chat messages.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if ((string)$game['status'] === 'closed') {
        error_response('Game has ended. Chat is read-only.', 409);
    }

    $body = json_input();
    $text = trim((string)($body['body'] ?? ''));

    if ($text === '') {
        error_response('Message body is required.', 422);
    }

    if (strlen($text) > 4000) {
        error_response('Message is too long.', 422);
    }

    $stmt = db()->prepare('INSERT INTO game_messages (game_id, user_id, body) VALUES (:game_id, :user_id, :body)');
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $user['id'],
        'body' => $text,
    ]);

    game_assign_missing_member_icons($gameId);

    $messageId = (int)db()->lastInsertId();

    success_response([
        'message' => [
            'id' => $messageId,
            'game_id' => $gameId,
            'body' => $text,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'icon_key' => game_member_icon_key($gameId, (int)$user['id']),
            ],
        ],
    ], 201);
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';

function start_session_if_needed(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $cfg = config()['session'];
    session_name($cfg['name']);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $cfg['secure'],
        'httponly' => $cfg['httponly'],
        'samesite' => $cfg['samesite'],
    ]);
    session_start();
}

function current_user(): ?array
{
    start_session_if_needed();

    $userId = $_SESSION['user_id'] ?? null;
    if (!is_int($userId) && !ctype_digit((string)$userId)) {
        return null;
    }

    $stmt = db()->prepare('SELECT id, username, is_active, created_at FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => (int)$userId]);
    $user = $stmt->fetch();

    if (!$user || (int)$user['is_active'] !== 1) {
        return null;
    }

    return [
        'id' => (int)$user['id'],
        'username' => (string)$user['username'],
        'created_at' => (string)$user['created_at'],
        'is_admin' => user_is_admin((int)$user['id']) ? 1 : 0,
    ];
}

function users_has_is_admin_column(): bool
{
    static $hasColumn = null;
    if ($hasColumn !== null) {
        return $hasColumn;
    }

    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS '
        . 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );
    $stmt->execute([
        'table_name' => 'users',
        'column_name' => 'is_admin',
    ]);

    $hasColumn = (int)$stmt->fetchColumn() > 0;
    return $hasColumn;
}

function user_is_admin(int $userId): bool
{
    if (!users_has_is_admin_column()) {
        return false;
    }

    $stmt = db()->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $userId]);

    return (int)$stmt->fetchColumn() === 1;
}

function require_user(): array
{
    $user = current_user();
    if ($user === null) {
        error_response('Unauthorized.', 401);
    }

    return $user;
}

function set_user_session(int $userId): void
{
    start_session_if_needed();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
}

function clear_user_session(): void
{
    start_session_if_needed();

    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            (bool)$params['secure'],
            (bool)$params['httponly']
        );
    }

    session_destroy();
}

function user_is_game_member(int $userId, int $gameId): bool
{
    $stmt = db()->prepare('SELECT 1 FROM game_members WHERE game_id = :game_id AND user_id = :user_id LIMIT 1');
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);

    return (bool)$stmt->fetchColumn();
}

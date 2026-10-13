<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/rooms.php';

function handle_admin_route(string $method, array $segments): void
{
    if (count($segments) < 1 || $segments[0] !== 'admin') {
        error_response('Not found.', 404);
    }

    if (count($segments) === 2 && $segments[1] === 'users' && $method === 'GET') {
        admin_users_list();
    }

    if (count($segments) === 2 && $segments[1] === 'rooms' && $method === 'GET') {
        admin_rooms_list();
    }

    if (count($segments) === 2 && $segments[1] === 'rooms' && $method === 'POST') {
        admin_rooms_create();
    }

    if (
        count($segments) === 3
        && $segments[1] === 'rooms'
        && ctype_digit($segments[2])
        && $method === 'POST'
    ) {
        admin_rooms_update((int)$segments[2]);
    }

    if (
        count($segments) === 3
        && $segments[1] === 'users'
        && ctype_digit($segments[2])
        && $method === 'DELETE'
    ) {
        admin_users_delete((int)$segments[2]);
    }

    if (
        count($segments) === 3
        && $segments[1] === 'rooms'
        && ctype_digit($segments[2])
        && $method === 'DELETE'
    ) {
        admin_rooms_delete((int)$segments[2]);
    }

    if (
        count($segments) === 4
        && $segments[1] === 'rooms'
        && ctype_digit($segments[2])
        && $segments[3] === 'members'
        && $method === 'POST'
    ) {
        admin_rooms_add_members((int)$segments[2]);
    }

    if (
        count($segments) === 5
        && $segments[1] === 'users'
        && ctype_digit($segments[2])
        && $segments[3] === 'rooms'
        && ctype_digit($segments[4])
        && $method === 'DELETE'
    ) {
        admin_users_remove_room((int)$segments[2], (int)$segments[4]);
    }

    if (
        count($segments) === 4
        && $segments[1] === 'users'
        && ctype_digit($segments[2])
        && $segments[3] === 'admin'
        && $method === 'POST'
    ) {
        admin_users_set_admin((int)$segments[2]);
    }

    error_response('Not found.', 404);
}

function admin_users_list(): void
{
    require_admin();

    $userStmt = db()->query(
        'SELECT u.id, u.username, u.is_admin, u.created_at, '
        . '(SELECT COUNT(*) FROM game_members gm WHERE gm.user_id = u.id) AS game_count '
        . 'FROM users u '
        . 'ORDER BY LOWER(u.username) ASC, u.id ASC'
    );
    $users = $userStmt->fetchAll();

    $roomStmt = db()->query(
        'SELECT ur.user_id, r.id, r.name, r.code '
        . 'FROM user_rooms ur '
        . 'JOIN rooms r ON r.id = ur.room_id '
        . 'ORDER BY LOWER(r.name) ASC, r.id ASC'
    );
    $roomRows = $roomStmt->fetchAll();
    $roomsByUser = [];
    foreach ($roomRows as $row) {
        $userId = (int)$row['user_id'];
        if (!isset($roomsByUser[$userId])) {
            $roomsByUser[$userId] = [];
        }
        $roomsByUser[$userId][] = room_public_array($row);
    }

    $payload = [];
    foreach ($users as $user) {
        $userId = (int)$user['id'];
        $payload[] = [
            'id' => $userId,
            'username' => (string)$user['username'],
            'is_admin' => (int)$user['is_admin'] === 1 ? 1 : 0,
            'created_at' => (string)$user['created_at'],
            'game_count' => (int)$user['game_count'],
            'rooms' => $roomsByUser[$userId] ?? [],
        ];
    }

    success_response(['users' => $payload]);
}

function admin_rooms_list(): void
{
    require_admin();
    $stmt = db()->query(
        'SELECT r.id, r.name, r.code, '
        . '(SELECT COUNT(*) FROM games g WHERE g.room_id = r.id) AS game_count '
        . 'FROM rooms r '
        . 'ORDER BY LOWER(r.name) ASC, r.id ASC'
    );
    $rooms = [];
    foreach ($stmt->fetchAll() as $row) {
        $rooms[] = array_merge(room_public_array($row), [
            'game_count' => (int)$row['game_count'],
        ]);
    }

    success_response(['rooms' => $rooms]);
}

function admin_rooms_create(): void
{
    require_admin();
    $body = json_input();
    $name = trim((string)($body['name'] ?? ''));
    $code = trim((string)($body['code'] ?? ''));

    if ($name === '' || strlen($name) > 80) {
        error_response('Room name is required and must be at most 80 characters.', 422);
    }

    if ($code === '' || strlen($code) > 80) {
        error_response('Room code is required and must be at most 80 characters.', 422);
    }

    try {
        $stmt = db()->prepare('INSERT INTO rooms (name, code) VALUES (:name, :code)');
        $stmt->execute([
            'name' => $name,
            'code' => $code,
        ]);
    } catch (PDOException $ex) {
        if ((int)$ex->getCode() === 23000) {
            error_response('Room code is already in use.', 409);
        }

        throw $ex;
    }

    $roomId = (int)db()->lastInsertId();
    $room = room_find_by_id($roomId);
    success_response([
        'room' => $room ? room_public_array($room) : [
            'id' => $roomId,
            'name' => $name,
            'code' => $code,
        ],
    ], 201);
}

function admin_rooms_update(int $roomId): void
{
    require_admin();
    if (room_find_by_id($roomId) === null) {
        error_response('Room not found.', 404);
    }

    $body = json_input();
    $name = trim((string)($body['name'] ?? ''));
    $code = trim((string)($body['code'] ?? ''));

    if ($name === '' || strlen($name) > 80) {
        error_response('Room name is required and must be at most 80 characters.', 422);
    }

    if ($code === '' || strlen($code) > 80) {
        error_response('Room code is required and must be at most 80 characters.', 422);
    }

    try {
        $stmt = db()->prepare('UPDATE rooms SET name = :name, code = :code WHERE id = :id');
        $stmt->execute([
            'name' => $name,
            'code' => $code,
            'id' => $roomId,
        ]);
    } catch (PDOException $ex) {
        if ((int)$ex->getCode() === 23000) {
            error_response('Room code is already in use.', 409);
        }

        throw $ex;
    }

    $room = room_find_by_id($roomId);
    success_response([
        'room' => $room ? array_merge(room_public_array($room), [
            'game_count' => admin_room_game_count($roomId),
        ]) : [
            'id' => $roomId,
            'name' => $name,
            'code' => $code,
        ],
    ]);
}

function admin_rooms_add_members(int $roomId): void
{
    require_admin();

    if (room_find_by_id($roomId) === null) {
        error_response('Room not found.', 404);
    }

    $body = json_input();
    $userIds = $body['user_ids'] ?? [];
    if (!is_array($userIds) || $userIds === []) {
        error_response('Select one or more users.', 422);
    }

    $normalized = [];
    foreach ($userIds as $userId) {
        $id = (int)$userId;
        if ($id > 0) {
            $normalized[$id] = $id;
        }
    }

    if ($normalized === []) {
        error_response('Select one or more users.', 422);
    }

    $placeholders = implode(',', array_fill(0, count($normalized), '?'));
    $existsStmt = db()->prepare('SELECT id FROM users WHERE id IN (' . $placeholders . ')');
    $existsStmt->execute(array_values($normalized));
    $existingIds = [];
    foreach ($existsStmt->fetchAll() as $row) {
        $existingIds[(int)$row['id']] = true;
    }

    foreach ($normalized as $userId) {
        if (!isset($existingIds[$userId])) {
            error_response('User not found.', 404);
        }
    }

    foreach ($normalized as $userId) {
        rooms_add_user($userId, $roomId);
    }

    success_response(['added' => true, 'room_id' => $roomId, 'user_ids' => array_values($normalized)]);
}

function admin_users_remove_room(int $userId, int $roomId): void
{
    require_admin();

    $userStmt = db()->prepare('SELECT id FROM users WHERE id = :id LIMIT 1');
    $userStmt->execute(['id' => $userId]);
    if (!$userStmt->fetchColumn()) {
        error_response('User not found.', 404);
    }

    if (room_find_by_id($roomId) === null) {
        error_response('Room not found.', 404);
    }

    rooms_remove_user($userId, $roomId);
    success_response(['removed' => true, 'user_id' => $userId, 'room_id' => $roomId]);
}

function admin_user_game_count(int $userId): int
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM game_members WHERE user_id = :user_id');
    $stmt->execute(['user_id' => $userId]);

    return (int)$stmt->fetchColumn();
}

function admin_room_game_count(int $roomId): int
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM games WHERE room_id = :room_id');
    $stmt->execute(['room_id' => $roomId]);

    return (int)$stmt->fetchColumn();
}

function admin_users_delete(int $userId): void
{
    $actor = require_admin();
    if ($userId === (int)$actor['id']) {
        error_response('You cannot delete your own account.', 403);
    }

    $userStmt = db()->prepare('SELECT id FROM users WHERE id = :id LIMIT 1');
    $userStmt->execute(['id' => $userId]);
    if (!$userStmt->fetchColumn()) {
        error_response('User not found.', 404);
    }

    if (admin_user_game_count($userId) > 0) {
        error_response('Users in games cannot be deleted.', 409);
    }

    $delete = db()->prepare('DELETE FROM users WHERE id = :id');
    $delete->execute(['id' => $userId]);
    success_response(['deleted' => true, 'user_id' => $userId]);
}

function admin_rooms_delete(int $roomId): void
{
    require_admin();
    if (room_find_by_id($roomId) === null) {
        error_response('Room not found.', 404);
    }

    if (admin_room_game_count($roomId) > 0) {
        error_response('Rooms with games cannot be deleted.', 409);
    }

    $delete = db()->prepare('DELETE FROM rooms WHERE id = :id');
    $delete->execute(['id' => $roomId]);
    success_response(['deleted' => true, 'room_id' => $roomId]);
}

function admin_users_set_admin(int $userId): void
{
    $actor = require_admin();
    $body = json_input();
    $wantAdmin = (int)($body['is_admin'] ?? 0) === 1 ? 1 : 0;

    if ($userId === (int)$actor['id'] && $wantAdmin !== 1) {
        error_response('You cannot remove your own admin access.', 403);
    }

    $userStmt = db()->prepare('SELECT id FROM users WHERE id = :id LIMIT 1');
    $userStmt->execute(['id' => $userId]);
    if (!$userStmt->fetchColumn()) {
        error_response('User not found.', 404);
    }

    $update = db()->prepare('UPDATE users SET is_admin = :is_admin WHERE id = :id');
    $update->execute([
        'is_admin' => $wantAdmin,
        'id' => $userId,
    ]);

    success_response([
        'user_id' => $userId,
        'is_admin' => $wantAdmin,
    ]);
}

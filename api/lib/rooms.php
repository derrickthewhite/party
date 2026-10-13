<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

function room_public_array(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'name' => (string)$row['name'],
        'code' => (string)$row['code'],
    ];
}

function rooms_list_all(): array
{
    $stmt = db()->query('SELECT id, name, code FROM rooms ORDER BY LOWER(name) ASC, id ASC');
    $rows = $stmt->fetchAll();
    $rooms = [];
    foreach ($rows as $row) {
        $rooms[] = room_public_array($row);
    }

    return $rooms;
}

function rooms_for_user(int $userId): array
{
    $stmt = db()->prepare(
        'SELECT r.id, r.name, r.code '
        . 'FROM user_rooms ur '
        . 'JOIN rooms r ON r.id = ur.room_id '
        . 'WHERE ur.user_id = :user_id '
        . 'ORDER BY LOWER(r.name) ASC, r.id ASC'
    );
    $stmt->execute(['user_id' => $userId]);
    $rows = $stmt->fetchAll();
    $rooms = [];
    foreach ($rows as $row) {
        $rooms[] = room_public_array($row);
    }

    return $rooms;
}

function user_has_room(int $userId, int $roomId): bool
{
    $stmt = db()->prepare(
        'SELECT 1 FROM user_rooms WHERE user_id = :user_id AND room_id = :room_id LIMIT 1'
    );
    $stmt->execute([
        'user_id' => $userId,
        'room_id' => $roomId,
    ]);

    return (bool)$stmt->fetchColumn();
}

function room_find_by_id(int $roomId): ?array
{
    $stmt = db()->prepare('SELECT id, name, code FROM rooms WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $roomId]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function room_find_by_code(string $code): ?array
{
    $stmt = db()->query('SELECT id, name, code FROM rooms');
    $match = null;
    foreach ($stmt->fetchAll() as $row) {
        if (hash_equals((string)$row['code'], $code)) {
            $match = $row;
        }
    }

    return $match;
}

function rooms_add_user(int $userId, int $roomId): void
{
    $stmt = db()->prepare('INSERT INTO user_rooms (user_id, room_id) VALUES (:user_id, :room_id)');
    try {
        $stmt->execute([
            'user_id' => $userId,
            'room_id' => $roomId,
        ]);
    } catch (PDOException $ex) {
        if ((int)$ex->getCode() === 23000) {
            return;
        }

        throw $ex;
    }
}

function rooms_remove_user(int $userId, int $roomId): void
{
    $stmt = db()->prepare(
        'DELETE FROM user_rooms WHERE user_id = :user_id AND room_id = :room_id'
    );
    $stmt->execute([
        'user_id' => $userId,
        'room_id' => $roomId,
    ]);
}

function user_sole_room_id(int $userId): ?int
{
    $rooms = rooms_for_user($userId);
    if (count($rooms) !== 1) {
        return null;
    }

    return (int)$rooms[0]['id'];
}

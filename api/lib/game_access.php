<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

function game_find_by_id(int $gameId): ?array
{
    $stmt = db()->prepare('SELECT id, owner_user_id, title, game_type, status, created_at FROM games WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $gameId]);
    $game = $stmt->fetch();

    return $game ?: null;
}

function game_member_role(int $userId, int $gameId): ?string
{
    $stmt = db()->prepare('SELECT role FROM game_members WHERE game_id = :game_id AND user_id = :user_id LIMIT 1');
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);

    $role = $stmt->fetchColumn();
    if (!is_string($role) || $role === '') {
        return null;
    }

    return $role;
}

function game_permissions_for_user(array $game, array $user, ?string $memberRole): array
{
    $status = (string)$game['status'];
    $isMember = $memberRole !== null;
    $isObserver = $memberRole === 'observer';
    $isOwner = isset($game['owner_user_id']) && (int)$game['owner_user_id'] === (int)($user['id'] ?? 0);
    $isAdmin = (int)($user['is_admin'] ?? 0) === 1;

    return [
        'can_start' => ($isOwner || $isAdmin) && $status === 'open',
        'can_end' => ($isOwner || $isAdmin) && $status !== 'closed',
        'can_end_turn' => ($isOwner || $isAdmin) && $status === 'in_progress',
        'can_delete' => $isOwner || $isAdmin,
        'can_join_player' => !$isMember && $status === 'open',
        'can_join_observer' => !$isMember,
        'can_leave' => $isMember && !$isOwner && $status === 'open',
        'can_chat' => $isMember && !$isObserver && $status !== 'closed',
        'can_act' => $isMember && !$isObserver && $status === 'in_progress',
    ];
}

function game_require_member_or_403(int $userId, int $gameId): string
{
    $role = game_member_role($userId, $gameId);
    if ($role === null) {
        error_response('Forbidden.', 403);
    }

    return $role;
}

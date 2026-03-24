<?php

declare(strict_types=1);

function mafia_game_on_start(int $gameId, int $actorUserId): void
{
    unset($actorUserId);

    mafia_assign_roles_if_missing($gameId);
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

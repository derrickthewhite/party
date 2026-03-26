<?php

declare(strict_types=1);

require_once __DIR__ . '/sql.php';

function diplomacy_game_build_detail_payload(int $gameId, array $game, array $user): array
{
    unset($user);

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

    return [
        'diplomacy_order_progress' => [
            'round_number' => $roundNumber,
            'submitted_count' => $submittedCount,
            'participant_count' => $participantCount,
        ],
    ];
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
            . 'SET revealed_at = ' . db_now_sql() . ' '
            . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type AND revealed_at IS NULL'
        );
        $revealStmt->execute([
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'action_type' => 'order',
        ]);
        $updated = $revealStmt->rowCount();

        $stateStmt = $pdo->prepare(db_upsert_sql(
            'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round)',
            ['game_id'],
            [
                'current_round' => db_greatest_sql('current_round', ':next_round'),
                'phase' => ':phase_update',
            ]
        ));
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

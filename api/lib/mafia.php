<?php

declare(strict_types=1);

require_once __DIR__ . '/game_access.php';
require_once __DIR__ . '/game_types.php';
require_once __DIR__ . '/sql.php';

function mafia_game_on_start(int $gameId, int $actorUserId): void
{
    $stage = 'start.begin';

    try {
        unset($actorUserId);

        $stage = 'start.schema';
        mafia_require_schema('start.schema');

        $stage = 'start.assign_roles';
        mafia_assign_roles_if_missing($gameId);

        $stage = 'start.initialize_standings';
        mafia_initialize_player_standings($gameId);
    } catch (Throwable $ex) {
        mafia_error_response('Mafia game start failed.', 500, $stage, $ex, [
            'game_id' => $gameId,
        ]);
    }
}

function mafia_error_response(string $message, int $status, string $stage, ?Throwable $ex = null, array $meta = []): void
{
    $baseMeta = [
        'stage' => $stage,
    ];

    if ($ex !== null) {
        $baseMeta['exception'] = [
            'type' => get_class($ex),
            'code' => (string)$ex->getCode(),
            'message' => $ex->getMessage(),
            'file' => $ex->getFile(),
            'line' => $ex->getLine(),
        ];
    }

    error_response($message, $status, array_merge($baseMeta, $meta));
}

function mafia_require_schema(string $stage): void
{
    $issues = mafia_schema_issues();
    if (empty($issues)) {
        return;
    }

    mafia_error_response('Mafia schema is incomplete on the server.', 500, $stage, null, [
        'issues' => $issues,
        'suggested_migrations' => [
            'sql/013_update_multi_type_games.sql',
            'sql/020_add_game_player_standings.sql',
        ],
    ]);
}

function mafia_schema_issues(): array
{
    static $cachedIssues = null;
    if (is_array($cachedIssues)) {
        return $cachedIssues;
    }

    $pdo = db();
    $required = [
        'game_state' => ['phase', 'current_round', 'winner_summary'],
        'game_actions' => ['action_type', 'payload', 'round_number', 'phase', 'revealed_at'],
        'game_roles' => ['role_key', 'is_hidden'],
        'game_members' => ['role'],
        'game_player_standings' => ['final_rank', 'eliminated_round', 'elimination_order', 'result_status'],
    ];

    $issues = [];
    foreach ($required as $tableName => $columns) {
        if (!db_schema_table_exists($pdo, $tableName)) {
            $issues[] = [
                'type' => 'missing_table',
                'table' => $tableName,
            ];
            continue;
        }

        foreach ($columns as $columnName) {
            if (!db_schema_column_exists($pdo, $tableName, $columnName)) {
                $issues[] = [
                    'type' => 'missing_column',
                    'table' => $tableName,
                    'column' => $columnName,
                ];
            }
        }
    }

    $cachedIssues = $issues;
    return $cachedIssues;
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

    $insertStmt = db()->prepare(db_insert_ignore_sql(
        'INSERT INTO game_roles (game_id, user_id, role_key, is_hidden) VALUES (:game_id, :user_id, :role_key, :is_hidden)',
        ['game_id', 'user_id', 'role_key']
    ));
    foreach ($selected as $row) {
        $insertStmt->execute([
            'game_id' => $gameId,
            'user_id' => (int)$row['user_id'],
            'role_key' => 'mafia',
            'is_hidden' => 1,
        ]);
    }
}

function mafia_game_build_detail_payload(int $gameId, array $game, array $user): array
{
    $stage = 'detail.schema';
    $viewerUserId = (int)($user['id'] ?? 0);
    $status = (string)($game['status'] ?? 'open');
    $phase = (string)($game['phase'] ?? 'start');
    $roundNumber = (int)($game['current_round'] ?? 1);

    try {
        mafia_require_schema($stage);

        $stage = 'detail.load_state';
        $currentState = mafia_game_state($gameId, (string)($game['game_type'] ?? 'mafia'));
        $phase = (string)($game['phase'] ?? $currentState['phase']);
        $roundNumber = (int)($game['current_round'] ?? $currentState['current_round']);

        if ($status === 'in_progress') {
            $stage = 'detail.initialize_standings';
            mafia_initialize_player_standings($gameId);

            $stage = 'detail.auto_advance';
            mafia_maybe_auto_advance($gameId);

            $stage = 'detail.reload_state';
            $freshState = mafia_game_state($gameId, (string)($game['game_type'] ?? 'mafia'));
            $phase = $freshState['phase'];
            $roundNumber = $freshState['current_round'];
            $status = (string)((game_find_by_id($gameId) ?: $game)['status'] ?? $status);
            $currentState = $freshState;
        }

        $stage = 'detail.roles';
        $roleMap = mafia_role_map($gameId);
        $selfRole = mafia_role_for_user($roleMap, $viewerUserId);

        $stage = 'detail.players';
        $players = mafia_build_player_payload($gameId, $viewerUserId, $status, $roleMap);
        $requiredVoterIds = $status === 'in_progress' ? mafia_required_voter_ids($gameId, $phase, $roleMap) : [];

        $stage = 'detail.submissions';
        $submissionActionType = mafia_submission_action_type_for_phase($phase);
        $latestSubmissions = $submissionActionType !== null
            ? mafia_latest_phase_submissions($gameId, $roundNumber, $submissionActionType)
            : [];
        $submittedCount = mafia_submitted_count_for_required_voters($latestSubmissions, $requiredVoterIds);
        $currentSubmission = isset($latestSubmissions[$viewerUserId]) ? $latestSubmissions[$viewerUserId] : null;
        $alivePlayerIds = mafia_alive_player_ids($gameId);

        $stage = 'detail.results';
        $latestResult = mafia_latest_result_payload($gameId);
        $recentResults = mafia_recent_result_payloads($gameId);

        $stage = 'detail.final_standings';
        $finalStandings = mafia_build_final_standings($gameId, $status);

        $phaseTitle = mafia_phase_title($phase);
        $phaseInstructions = mafia_phase_instructions($phase);

        return [
            'mafia_state' => [
                'phase' => $phase,
                'round_number' => $roundNumber,
                'phase_title' => $phaseTitle,
                'phase_instructions' => $phaseInstructions,
                'self_role' => $selfRole,
                'self_is_alive' => in_array($viewerUserId, $alivePlayerIds, true),
                'submission_action_type' => $submissionActionType,
                'can_submit' => $status === 'in_progress' && mafia_can_user_submit_for_phase($gameId, $viewerUserId, $phase, $roleMap),
                'has_submitted' => $currentSubmission !== null,
                'current_vote_target_user_id' => isset($currentSubmission['target_user_id']) ? $currentSubmission['target_user_id'] : null,
                'submitted_count' => $submittedCount,
                'required_count' => count($requiredVoterIds),
                'players' => $players,
                'latest_result' => $latestResult,
                'recent_results' => $recentResults,
                'winner_summary' => $currentState['winner_summary'],
            ],
            'final_standings' => $finalStandings,
        ];
    } catch (Throwable $ex) {
        mafia_error_response('Unable to build mafia game detail payload.', 500, $stage, $ex, [
            'game_id' => $gameId,
            'viewer_user_id' => $viewerUserId,
            'game_status' => $status,
            'phase' => $phase,
            'round_number' => $roundNumber,
        ]);
    }
}

function mafia_validate_action_create(int $gameId, int $userId, string $actionType, array $payload): void
{
    $stage = 'action.schema';
    $phase = 'unknown';
    $roundNumber = 0;

    try {
        mafia_require_schema($stage);

        $stage = 'action.load_game';
        $game = game_find_by_id($gameId);
        if ($game === null) {
            error_response('Game not found.', 404);
        }

        $stage = 'action.load_state';
        $state = mafia_game_state($gameId, (string)($game['game_type'] ?? 'mafia'));
        $phase = $state['phase'];
        $roundNumber = $state['current_round'];
        $expectedActionType = mafia_submission_action_type_for_phase($phase);
        if ($expectedActionType === null || $actionType !== $expectedActionType) {
            error_response('This action is not allowed in the current mafia phase.', 409, [
                'expected_action_type' => $expectedActionType,
                'actual_action_type' => $actionType,
                'phase' => $phase,
            ]);
        }

        $stage = 'action.roles';
        $roleMap = mafia_role_map($gameId);
        if (!mafia_can_user_submit_for_phase($gameId, $userId, $phase, $roleMap)) {
            error_response('You cannot act in the current mafia phase.', 403, [
                'phase' => $phase,
                'user_id' => $userId,
            ]);
        }

        if ($phase === 'start') {
            return;
        }

        $stage = 'action.validate_target';
        $targetRaw = $payload['target_user_id'] ?? null;
        if (!is_int($targetRaw) && !ctype_digit((string)$targetRaw)) {
            error_response('A valid target_user_id is required.', 422);
        }

        $targetUserId = (int)$targetRaw;
        $eligibleTargets = mafia_eligible_target_ids_for_user($gameId, $userId, $phase, $roleMap);
        if (!in_array($targetUserId, $eligibleTargets, true)) {
            error_response('That player cannot be targeted in the current mafia phase.', 422, [
                'target_user_id' => $targetUserId,
                'phase' => $phase,
                'eligible_target_user_ids' => $eligibleTargets,
            ]);
        }

        $stage = 'action.check_duplicate';
        $latestSubmissions = mafia_latest_phase_submissions($gameId, $roundNumber, $actionType);
        if (isset($latestSubmissions[$userId]) && isset($latestSubmissions[$userId]['target_user_id']) && $latestSubmissions[$userId]['target_user_id'] === $targetUserId) {
            error_response('You already submitted that vote.', 409, [
                'target_user_id' => $targetUserId,
                'phase' => $phase,
                'round_number' => $roundNumber,
            ]);
        }
    } catch (Throwable $ex) {
        mafia_error_response('Mafia action validation failed.', 500, $stage, $ex, [
            'game_id' => $gameId,
            'user_id' => $userId,
            'action_type' => $actionType,
            'phase' => $phase,
            'round_number' => $roundNumber,
        ]);
    }
}

function mafia_after_action_create(int $gameId, int $roundNumber, string $actionType): void
{
    $stage = 'after_action.schema';

    try {
        mafia_require_schema($stage);

        $stage = 'after_action.auto_advance';
        mafia_maybe_auto_advance($gameId);
    } catch (Throwable $ex) {
        mafia_error_response('Mafia post-action processing failed.', 500, $stage, $ex, [
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'action_type' => $actionType,
        ]);
    }
}

function mafia_initialize_player_standings(int $gameId): void
{
    $membersStmt = db()->prepare(
        'SELECT gm.user_id FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND u.is_active = 1'
    );
    $membersStmt->execute(['game_id' => $gameId]);
    $userIds = array_map(static fn (array $row): int => (int)$row['user_id'], $membersStmt->fetchAll());
    if (empty($userIds)) {
        return;
    }

    $insertStmt = db()->prepare(db_insert_ignore_sql(
        'INSERT INTO game_player_standings (game_id, user_id, result_status) VALUES (:game_id, :user_id, :result_status)',
        ['game_id', 'user_id']
    ));
    foreach ($userIds as $userId) {
        $insertStmt->execute([
            'game_id' => $gameId,
            'user_id' => $userId,
            'result_status' => 'active',
        ]);
    }
}

function mafia_game_state(int $gameId, string $gameType = 'mafia'): array
{
    $stmt = db()->prepare('SELECT phase, current_round, winner_summary FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stmt->execute(['game_id' => $gameId]);
    $row = $stmt->fetch();

    return [
        'phase' => (string)($row['phase'] ?? default_phase_for_game_type($gameType)),
        'current_round' => (int)($row['current_round'] ?? 1),
        'winner_summary' => isset($row['winner_summary']) && $row['winner_summary'] !== null ? (string)$row['winner_summary'] : null,
    ];
}

function mafia_role_map(int $gameId): array
{
    $stmt = db()->prepare('SELECT user_id, role_key FROM game_roles WHERE game_id = :game_id');
    $stmt->execute(['game_id' => $gameId]);
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $userId = (int)$row['user_id'];
        if (!isset($map[$userId])) {
            $map[$userId] = [];
        }
        $map[$userId][] = (string)$row['role_key'];
    }
    return $map;
}

function mafia_role_for_user(array $roleMap, int $userId): string
{
    return in_array('mafia', $roleMap[$userId] ?? [], true) ? 'mafia' : 'town';
}

function mafia_alive_player_rows(int $gameId): array
{
    $stmt = db()->prepare(
        'SELECT gm.user_id, gm.role, u.username FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND u.is_active = 1 '
        . 'ORDER BY u.username ASC'
    );
    $stmt->execute(['game_id' => $gameId]);
    return $stmt->fetchAll();
}

function mafia_alive_player_ids(int $gameId): array
{
    $rows = mafia_alive_player_rows($gameId);
    $ids = [];
    foreach ($rows as $row) {
        if ((string)($row['role'] ?? '') === 'observer') {
            continue;
        }
        $ids[] = (int)$row['user_id'];
    }
    return $ids;
}

function mafia_alive_mafia_ids(int $gameId, array $roleMap): array
{
    $alive = mafia_alive_player_ids($gameId);
    $mafiaIds = [];
    foreach ($alive as $userId) {
        if (mafia_role_for_user($roleMap, $userId) === 'mafia') {
            $mafiaIds[] = $userId;
        }
    }
    return $mafiaIds;
}

function mafia_build_player_payload(int $gameId, int $viewerUserId, string $gameStatus, array $roleMap): array
{
    $viewerRole = mafia_role_for_user($roleMap, $viewerUserId);
    $phase = mafia_game_state($gameId)['phase'];
    $rows = mafia_alive_player_rows($gameId);
    $players = [];

    foreach ($rows as $row) {
        $userId = (int)$row['user_id'];
        $isAlive = (string)($row['role'] ?? '') !== 'observer';
        $role = mafia_role_for_user($roleMap, $userId);
        $knownRole = null;

        if ($gameStatus === 'closed' || $userId === $viewerUserId) {
            $knownRole = $role;
        } elseif ($viewerRole === 'mafia' && $role === 'mafia') {
            $knownRole = 'mafia';
        }

        $eligibleTargets = mafia_eligible_target_ids_for_user($gameId, $viewerUserId, $phase, $roleMap);
        $players[] = [
            'user_id' => $userId,
            'username' => (string)$row['username'],
            'is_self' => $userId === $viewerUserId,
            'is_alive' => $isAlive,
            'is_eliminated' => !$isAlive,
            'known_role' => $knownRole,
            'can_target_by_self' => in_array($userId, $eligibleTargets, true),
        ];
    }

    return $players;
}

function mafia_submission_action_type_for_phase(string $phase): ?string
{
    if ($phase === 'start') {
        return 'mafia_ready';
    }
    if ($phase === 'day') {
        return 'mafia_day_vote';
    }
    if ($phase === 'night') {
        return 'mafia_night_vote';
    }

    return null;
}

function mafia_required_voter_ids(int $gameId, string $phase, array $roleMap): array
{
    if ($phase === 'start' || $phase === 'day') {
        return mafia_alive_player_ids($gameId);
    }
    if ($phase === 'night') {
        return mafia_alive_mafia_ids($gameId, $roleMap);
    }
    return [];
}

function mafia_can_user_submit_for_phase(int $gameId, int $userId, string $phase, array $roleMap): bool
{
    $alivePlayerIds = mafia_alive_player_ids($gameId);
    if (!in_array($userId, $alivePlayerIds, true)) {
        return false;
    }
    if ($phase === 'night') {
        return mafia_role_for_user($roleMap, $userId) === 'mafia';
    }
    return in_array($phase, ['start', 'day'], true);
}

function mafia_eligible_target_ids_for_user(int $gameId, int $userId, string $phase, array $roleMap): array
{
    if ($phase === 'start') {
        return [];
    }

    $alivePlayerIds = mafia_alive_player_ids($gameId);
    $targets = [];
    foreach ($alivePlayerIds as $targetUserId) {
        if ($targetUserId === $userId) {
            continue;
        }
        if ($phase === 'night' && mafia_role_for_user($roleMap, $targetUserId) === 'mafia') {
            continue;
        }
        $targets[] = $targetUserId;
    }

    return $targets;
}

function mafia_latest_phase_submissions(int $gameId, int $roundNumber, string $actionType): array
{
    $stmt = db()->prepare(
        'SELECT id, user_id, payload FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type '
        . 'ORDER BY id DESC'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => $actionType,
    ]);

    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $userId = (int)$row['user_id'];
        if (isset($map[$userId])) {
            continue;
        }

        $payload = json_decode((string)$row['payload'], true);
        if (!is_array($payload)) {
            $payload = [];
        }
        $map[$userId] = [
            'id' => (int)$row['id'],
            'user_id' => $userId,
            'target_user_id' => isset($payload['target_user_id']) && (is_int($payload['target_user_id']) || ctype_digit((string)$payload['target_user_id']))
                ? (int)$payload['target_user_id']
                : null,
        ];
    }

    return $map;
}

function mafia_submitted_count_for_required_voters(array $submissionMap, array $requiredVoterIds): int
{
    $count = 0;
    foreach ($requiredVoterIds as $userId) {
        if (isset($submissionMap[$userId])) {
            $count += 1;
        }
    }
    return $count;
}

function mafia_phase_title(string $phase): string
{
    if ($phase === 'start') {
        return 'Role Reveal';
    }
    if ($phase === 'day') {
        return 'Day Vote';
    }
    if ($phase === 'night') {
        return 'Night Vote';
    }
    return 'Mafia';
}

function mafia_phase_instructions(string $phase): string
{
    if ($phase === 'start') {
        return 'Review your role. The game moves into Day once every living player clicks Ready.';
    }
    if ($phase === 'day') {
        return 'Every living player votes to eliminate one target. The phase advances automatically once all living players have voted.';
    }
    if ($phase === 'night') {
        return 'Only living mafia vote at night. The phase advances automatically once all living mafia have voted.';
    }
    return 'Follow the current phase instructions.';
}

function mafia_latest_result_payload(int $gameId): ?array
{
    $rows = mafia_recent_result_payloads($gameId, 1);
    return $rows[0] ?? null;
}

function mafia_recent_result_payloads(int $gameId, int $limit = 6): array
{
    $stmt = db()->prepare(
        'SELECT action_type, payload, round_number, phase, created_at FROM game_actions '
        . 'WHERE game_id = :game_id AND action_type IN (:day_result, :night_result, :game_over) AND revealed_at IS NOT NULL '
        . 'ORDER BY id DESC LIMIT ' . max(1, (int)$limit)
    );
    $stmt->execute([
        'game_id' => $gameId,
        'day_result' => 'mafia_day_result',
        'night_result' => 'mafia_night_result',
        'game_over' => 'mafia_game_over',
    ]);

    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $payload = json_decode((string)$row['payload'], true);
        if (!is_array($payload)) {
            $payload = [];
        }
        $rows[] = [
            'action_type' => (string)$row['action_type'],
            'round_number' => (int)$row['round_number'],
            'phase' => (string)$row['phase'],
            'created_at' => (string)$row['created_at'],
            'summary_text' => (string)($payload['summary_text'] ?? ''),
            'payload' => $payload,
        ];
    }

    return $rows;
}

function mafia_build_final_standings(int $gameId, string $status): ?array
{
    if ($status !== 'closed') {
        return null;
    }

    $roleMap = mafia_role_map($gameId);
    $stmt = db()->prepare(
        'SELECT gps.user_id, gps.final_rank, gps.eliminated_round, gps.elimination_order, gps.result_status, u.username '
        . 'FROM game_player_standings gps '
        . 'JOIN users u ON u.id = gps.user_id '
        . 'WHERE gps.game_id = :game_id '
        . 'ORDER BY COALESCE(gps.final_rank, 9999) ASC, COALESCE(gps.elimination_order, 9999) ASC, u.username ASC'
    );
    $stmt->execute(['game_id' => $gameId]);

    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $userId = (int)$row['user_id'];
        $rows[] = [
            'user_id' => $userId,
            'username' => (string)$row['username'],
            'role' => mafia_role_for_user($roleMap, $userId),
            'final_rank' => isset($row['final_rank']) ? (int)$row['final_rank'] : null,
            'eliminated_round' => isset($row['eliminated_round']) ? ($row['eliminated_round'] === null ? null : (int)$row['eliminated_round']) : null,
            'elimination_order' => isset($row['elimination_order']) ? ($row['elimination_order'] === null ? null : (int)$row['elimination_order']) : null,
            'result_status' => (string)$row['result_status'],
        ];
    }

    return $rows;
}

function mafia_maybe_auto_advance(int $gameId): void
{
    for ($guard = 0; $guard < 4; $guard += 1) {
        $game = game_find_by_id($gameId);
        if ($game === null || (string)$game['status'] !== 'in_progress') {
            return;
        }

        $state = mafia_game_state($gameId, (string)($game['game_type'] ?? 'mafia'));
        $phase = $state['phase'];
        $roundNumber = $state['current_round'];
        $roleMap = mafia_role_map($gameId);

        $winner = mafia_winner_key($gameId, $roleMap);
        if ($winner !== null) {
            mafia_close_game($gameId, $winner, $roundNumber, $phase, $roleMap);
            return;
        }

        $actionType = mafia_submission_action_type_for_phase($phase);
        if ($actionType === null) {
            return;
        }

        $requiredVoterIds = mafia_required_voter_ids($gameId, $phase, $roleMap);
        $submissionMap = mafia_latest_phase_submissions($gameId, $roundNumber, $actionType);
        if (mafia_submitted_count_for_required_voters($submissionMap, $requiredVoterIds) < count($requiredVoterIds)) {
            return;
        }

        if (!mafia_resolve_phase($gameId, $phase, $roundNumber, $roleMap)) {
            return;
        }
    }
}

function mafia_resolve_phase(int $gameId, string $phase, int $roundNumber, array $roleMap): bool
{
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $state = mafia_game_state($gameId);
        if ($state['phase'] !== $phase || $state['current_round'] !== $roundNumber) {
            $pdo->commit();
            return false;
        }

        $requiredVoterIds = mafia_required_voter_ids($gameId, $phase, $roleMap);
        $submissionMap = mafia_latest_phase_submissions($gameId, $roundNumber, (string)mafia_submission_action_type_for_phase($phase));
        if (mafia_submitted_count_for_required_voters($submissionMap, $requiredVoterIds) < count($requiredVoterIds)) {
            $pdo->commit();
            return false;
        }

        if ($phase === 'start') {
            mafia_update_phase_state($gameId, 'day', $roundNumber, null);
            $pdo->commit();
            return true;
        }

        $voteCounts = mafia_vote_counts($gameId, $submissionMap);
        $eliminatedUserId = mafia_pick_vote_target($voteCounts, $gameId, $roundNumber, $phase);
        $eliminatedUsername = mafia_username($eliminatedUserId);
        $eliminatedRole = mafia_eliminate_player($gameId, $eliminatedUserId, $roundNumber);
        $summaryText = $phase === 'day'
            ? $eliminatedUsername . ' was eliminated during the day. Role: ' . ucfirst($eliminatedRole) . '.'
            : $eliminatedUsername . ' was eliminated during the night. Role: ' . ucfirst($eliminatedRole) . '.';

        $nextRoleMap = mafia_role_map($gameId);
        $winner = mafia_winner_key($gameId, $nextRoleMap);
        $nextPhase = $phase === 'day' ? 'night' : 'day';
        $nextRound = $phase === 'day' ? $roundNumber : ($roundNumber + 1);

        mafia_insert_visible_result_action(
            $gameId,
            $phase === 'day' ? 'mafia_day_result' : 'mafia_night_result',
            $phase,
            $roundNumber,
            [
                'eliminated_user_id' => $eliminatedUserId,
                'eliminated_username' => $eliminatedUsername,
                'eliminated_role' => $eliminatedRole,
                'vote_counts' => $voteCounts,
                'summary_text' => $summaryText,
            ]
        );

        if ($winner !== null) {
            mafia_close_game($gameId, $winner, $roundNumber, $phase, $nextRoleMap, false);
            $pdo->commit();
            return true;
        }

        mafia_update_phase_state($gameId, $nextPhase, $nextRound, null);
        $pdo->commit();
        return true;
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }
}

function mafia_vote_counts(int $gameId, array $submissionMap): array
{
    $counts = [];
    foreach ($submissionMap as $submission) {
        $targetUserId = isset($submission['target_user_id']) ? (int)$submission['target_user_id'] : 0;
        if ($targetUserId <= 0) {
            continue;
        }
        if (!isset($counts[$targetUserId])) {
            $counts[$targetUserId] = 0;
        }
        $counts[$targetUserId] += 1;
    }

    $rows = [];
    foreach ($counts as $targetUserId => $count) {
        $rows[] = [
            'user_id' => (int)$targetUserId,
            'username' => mafia_username((int)$targetUserId),
            'count' => (int)$count,
        ];
    }

    usort($rows, static function (array $left, array $right): int {
        if ((int)$left['count'] === (int)$right['count']) {
            return strcmp((string)$left['username'], (string)$right['username']);
        }
        return (int)$right['count'] <=> (int)$left['count'];
    });

    return $rows;
}

function mafia_pick_vote_target(array $voteCounts, int $gameId, int $roundNumber, string $phase): int
{
    if (empty($voteCounts)) {
        throw new RuntimeException('Cannot resolve a mafia phase without votes.');
    }

    $topCount = (int)$voteCounts[0]['count'];
    $candidates = [];
    foreach ($voteCounts as $voteRow) {
        if ((int)$voteRow['count'] !== $topCount) {
            break;
        }
        $candidates[] = (int)$voteRow['user_id'];
    }

    return count($candidates) === 1
        ? $candidates[0]
        : deterministic_pick_player_id($candidates, $gameId, $roundNumber, 'mafia:' . $phase . ':tiebreak');
}

function mafia_eliminate_player(int $gameId, int $userId, int $roundNumber): string
{
    $roleMap = mafia_role_map($gameId);
    $role = mafia_role_for_user($roleMap, $userId);

    $observerStmt = db()->prepare('UPDATE game_members SET role = :role WHERE game_id = :game_id AND user_id = :user_id');
    $observerStmt->execute([
        'role' => 'observer',
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);

    $orderStmt = db()->prepare(
        'SELECT COALESCE(MAX(elimination_order), 0) FROM game_player_standings '
        . 'WHERE game_id = :game_id'
    );
    $orderStmt->execute(['game_id' => $gameId]);
    $nextOrder = ((int)$orderStmt->fetchColumn()) + 1;

    $standingStmt = db()->prepare(
        'UPDATE game_player_standings '
        . 'SET eliminated_round = :eliminated_round, elimination_order = :elimination_order, result_status = :result_status '
        . 'WHERE game_id = :game_id AND user_id = :user_id'
    );
    $standingStmt->execute([
        'eliminated_round' => $roundNumber,
        'elimination_order' => $nextOrder,
        'result_status' => 'eliminated',
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);

    return $role;
}

function mafia_winner_key(int $gameId, array $roleMap): ?string
{
    $alivePlayerIds = mafia_alive_player_ids($gameId);
    $aliveMafia = 0;
    $aliveTown = 0;
    foreach ($alivePlayerIds as $userId) {
        if (mafia_role_for_user($roleMap, $userId) === 'mafia') {
            $aliveMafia += 1;
        } else {
            $aliveTown += 1;
        }
    }

    if ($aliveMafia <= 0) {
        return 'town';
    }
    if ($aliveMafia >= $aliveTown) {
        return 'mafia';
    }

    return null;
}

function mafia_close_game(int $gameId, string $winnerKey, int $roundNumber, string $phase, array $roleMap, bool $manageTransaction = true): void
{
    $pdo = db();
    if ($manageTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $winnerSummary = ucfirst($winnerKey) . ' wins.';

        $statusStmt = $pdo->prepare('UPDATE games SET status = :status WHERE id = :id');
        $statusStmt->execute([
            'status' => 'closed',
            'id' => $gameId,
        ]);

        mafia_update_phase_state($gameId, $phase, $roundNumber, $winnerSummary, true);

        $winnerIds = [];
        foreach (mafia_alive_player_rows($gameId) as $row) {
            $userId = (int)$row['user_id'];
            if (mafia_role_for_user($roleMap, $userId) === $winnerKey) {
                $winnerIds[] = $userId;
            }
        }

        $standingsStmt = $pdo->prepare(
            'UPDATE game_player_standings '
            . 'SET final_rank = :final_rank, result_status = :result_status '
            . 'WHERE game_id = :game_id AND user_id = :user_id'
        );

        foreach (mafia_alive_player_rows($gameId) as $row) {
            $userId = (int)$row['user_id'];
            $isWinner = in_array($userId, $winnerIds, true);
            $standingsStmt->execute([
                'final_rank' => $isWinner ? 1 : 2,
                'result_status' => $isWinner ? 'winner' : 'loser',
                'game_id' => $gameId,
                'user_id' => $userId,
            ]);
        }

        mafia_insert_visible_result_action(
            $gameId,
            'mafia_game_over',
            $phase,
            $roundNumber,
            [
                'winner' => $winnerKey,
                'summary_text' => $winnerSummary,
            ]
        );

        if ($manageTransaction) {
            $pdo->commit();
        }
    } catch (Throwable $ex) {
        if ($manageTransaction) {
            $pdo->rollBack();
        }
        throw $ex;
    }
}

function mafia_update_phase_state(int $gameId, string $phase, int $roundNumber, ?string $winnerSummary, bool $ended = false): void
{
    $assignments = [
        'current_round' => ':current_round_update',
        'phase' => ':phase_update',
        'winner_summary' => $winnerSummary === null ? 'winner_summary' : ':winner_summary_update',
    ];
    if ($ended) {
        $assignments['ended_at'] = db_now_sql();
    }

    $stmt = db()->prepare(db_upsert_sql(
        'INSERT INTO game_state (game_id, phase, current_round, winner_summary, ended_at) '
        . 'VALUES (:game_id, :phase, :current_round, :winner_summary, ' . ($ended ? db_now_sql() : 'NULL') . ')',
        ['game_id'],
        $assignments
    ));
    $params = [
        'game_id' => $gameId,
        'phase' => $phase,
        'current_round' => $roundNumber,
        'current_round_update' => $roundNumber,
        'phase_update' => $phase,
        'winner_summary' => $winnerSummary,
    ];
    if ($winnerSummary !== null) {
        $params['winner_summary_update'] = $winnerSummary;
    }

    $stmt->execute($params);
}

function mafia_insert_visible_result_action(int $gameId, string $actionType, string $phase, int $roundNumber, array $payload): void
{
    $game = game_find_by_id($gameId);
    if ($game === null) {
        return;
    }

    $stmt = db()->prepare(
        'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
        . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, ' . db_now_sql() . ')'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$game['owner_user_id'],
        'action_type' => $actionType,
        'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
        'round_number' => $roundNumber,
        'phase' => $phase,
    ]);
}

function mafia_username(int $userId): string
{
    $stmt = db()->prepare('SELECT username FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $userId]);
    $name = $stmt->fetchColumn();
    return is_string($name) && $name !== '' ? $name : ('User ' . $userId);
}

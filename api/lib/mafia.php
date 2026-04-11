<?php

declare(strict_types=1);

require_once __DIR__ . '/game_access.php';
require_once __DIR__ . '/game_icons.php';
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

    $memberIds = mafia_role_assignment_member_ids($gameId);
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

    $mafiaCount = mafia_preview_mafia_count(count($memberIds));
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

function mafia_role_assignment_member_ids(int $gameId): array
{
    $membersStmt = db()->prepare(
        'SELECT user_id FROM game_members WHERE game_id = :game_id AND role <> :observer_role ORDER BY user_id ASC'
    );
    $membersStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);

    return array_map(static fn (array $row): int => (int)$row['user_id'], $membersStmt->fetchAll());
}

function mafia_preview_mafia_count(int $playerCount): int
{
    if ($playerCount <= 0) {
        return 0;
    }

    return max(1, (int)floor($playerCount / 3));
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
        $alivePlayerIds = mafia_alive_player_ids($gameId);
        $viewerIsAlive = in_array($viewerUserId, $alivePlayerIds, true);

        $stage = 'detail.players';
        $setupPlayerCount = count(mafia_role_assignment_member_ids($gameId));
        $setupMafiaCount = mafia_preview_mafia_count($setupPlayerCount);
        $voteActionType = mafia_vote_action_type_for_phase($phase);
        $suggestionActionType = mafia_suggestion_action_type_for_phase($phase);
        $progressActionType = mafia_progress_action_type_for_phase($phase);
        $latestVotes = $voteActionType !== null
            ? mafia_latest_phase_actions($gameId, $roundNumber, $voteActionType)
            : [];
        $latestSuggestions = $suggestionActionType !== null
            ? mafia_latest_phase_actions($gameId, $roundNumber, $suggestionActionType)
            : [];
        $players = mafia_build_player_payload(
            $gameId,
            $viewerUserId,
            $status,
            $phase,
            $roleMap,
            $selfRole,
            $viewerIsAlive,
            $latestSuggestions,
            $latestVotes
        );
        $requiredVoterIds = $status === 'in_progress' ? mafia_required_voter_ids($gameId, $phase, $roleMap) : [];

        $stage = 'detail.submissions';
        $latestProgressActions = $progressActionType !== null
            ? mafia_latest_phase_actions($gameId, $roundNumber, $progressActionType)
            : [];
        $submittedCount = $phase === 'start'
            ? mafia_submitted_count_for_required_voters($latestProgressActions, $requiredVoterIds)
            : mafia_active_vote_count_for_required_voters($latestProgressActions, $requiredVoterIds);
        $currentVote = isset($latestVotes[$viewerUserId]) ? $latestVotes[$viewerUserId] : null;
        $currentSuggestion = isset($latestSuggestions[$viewerUserId]) ? $latestSuggestions[$viewerUserId] : null;
        $currentDisplaySuggestionTargetUserId = mafia_displayed_suggestion_target_user_id($currentSuggestion, $currentVote);

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
                'self_is_alive' => $viewerIsAlive,
                'submission_action_type' => $progressActionType,
                'suggestion_action_type' => $suggestionActionType,
                'vote_action_type' => $voteActionType,
                'can_submit' => $status === 'in_progress' && mafia_can_user_submit_for_phase($gameId, $viewerUserId, $phase, $roleMap),
                'has_submitted' => mafia_progress_action_is_complete_for_user($phase, $viewerUserId, $latestProgressActions),
                'current_suggestion_target_user_id' => isset($currentSuggestion['target_user_id']) ? $currentSuggestion['target_user_id'] : null,
                'current_display_suggestion_target_user_id' => $currentDisplaySuggestionTargetUserId,
                'current_vote_target_user_id' => isset($currentVote['target_user_id']) ? $currentVote['target_user_id'] : null,
                'submitted_count' => $submittedCount,
                'required_count' => count($requiredVoterIds),
                'setup_player_count' => $setupPlayerCount,
                'setup_mafia_count' => $setupMafiaCount,
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
        $allowedActionTypes = mafia_allowed_action_types_for_phase($phase);
        if (empty($allowedActionTypes) || !in_array($actionType, $allowedActionTypes, true)) {
            error_response('This action is not allowed in the current mafia phase.', 409, [
                'expected_action_types' => $allowedActionTypes,
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

        $isVoteAction = $actionType === mafia_vote_action_type_for_phase($phase);
        $isSuggestionAction = $actionType === mafia_suggestion_action_type_for_phase($phase);
        $isClearingVote = $isVoteAction && !empty($payload['clear']);
        $isClearingSuggestion = $isSuggestionAction && !empty($payload['clear']);

        $stage = 'action.validate_target';
        $stage = 'action.check_duplicate';
        $latestActions = mafia_latest_phase_actions($gameId, $roundNumber, $actionType);
        $latestAction = isset($latestActions[$userId]) ? $latestActions[$userId] : null;
        if ($isClearingVote) {
            if (!mafia_action_has_target($latestAction)) {
                error_response('You do not have a vote to withdraw.', 409, [
                    'phase' => $phase,
                    'round_number' => $roundNumber,
                ]);
            }

            return;
        }

        if ($isClearingSuggestion) {
            if (!mafia_action_has_target($latestAction)) {
                error_response('You do not have a suggestion to withdraw.', 409, [
                    'phase' => $phase,
                    'round_number' => $roundNumber,
                ]);
            }

            return;
        }

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

        if (mafia_action_targets_user($latestAction, $targetUserId)) {
            $message = $actionType === mafia_suggestion_action_type_for_phase($phase)
                ? 'You already suggested that player.'
                : 'You already voted for that player.';
            error_response($message, 409, [
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
        'SELECT gm.user_id, gm.role, u.username, ' . game_member_icon_select_sql('gm', 'icon_key') . ' FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND u.is_active = 1 '
        . 'ORDER BY u.username ASC'
    );
    $stmt->execute(['game_id' => $gameId]);
    return $stmt->fetchAll();
}

function mafia_live_choice_usernames_by_target(array $latestActions, array $usernameByUserId): array
{
    $usernamesByTargetUserId = [];

    foreach ($latestActions as $userId => $action) {
        if (!mafia_action_has_target($action)) {
            continue;
        }

        $targetUserId = (int)$action['target_user_id'];
        $username = isset($usernameByUserId[$userId]) ? (string)$usernameByUserId[$userId] : '';
        if ($username === '') {
            continue;
        }

        if (!isset($usernamesByTargetUserId[$targetUserId])) {
            $usernamesByTargetUserId[$targetUserId] = [];
        }

        $usernamesByTargetUserId[$targetUserId][] = $username;
    }

    foreach ($usernamesByTargetUserId as &$usernames) {
        sort($usernames, SORT_NATURAL | SORT_FLAG_CASE);
    }
    unset($usernames);

    return $usernamesByTargetUserId;
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

function mafia_build_player_payload(
    int $gameId,
    int $viewerUserId,
    string $gameStatus,
    string $phase,
    array $roleMap,
    string $viewerRole,
    bool $viewerIsAlive,
    array $latestSuggestions,
    array $latestVotes
): array
{
    $rows = mafia_alive_player_rows($gameId);
    $players = [];
    $eligibleTargets = mafia_eligible_target_ids_for_user($gameId, $viewerUserId, $phase, $roleMap);
    $canViewLiveChoices = mafia_can_view_live_choices($gameStatus, $phase, $viewerRole, $viewerIsAlive);
    $usernameByUserId = [];

    foreach ($rows as $row) {
        $usernameByUserId[(int)$row['user_id']] = (string)$row['username'];
    }

    $incomingSuggestionUsernamesByTargetUserId = $canViewLiveChoices
        ? mafia_live_choice_usernames_by_target($latestSuggestions, $usernameByUserId)
        : [];
    $incomingVoteUsernamesByTargetUserId = $canViewLiveChoices
        ? mafia_live_choice_usernames_by_target($latestVotes, $usernameByUserId)
        : [];

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

        $suggestionTargetUserId = null;
        $displaySuggestionTargetUserId = null;
        $voteTargetUserId = null;
        if ($canViewLiveChoices) {
            $suggestion = isset($latestSuggestions[$userId]) ? $latestSuggestions[$userId] : null;
            $vote = isset($latestVotes[$userId]) ? $latestVotes[$userId] : null;
            $suggestionTargetUserId = isset($suggestion['target_user_id']) ? $suggestion['target_user_id'] : null;
            $voteTargetUserId = isset($vote['target_user_id']) ? $vote['target_user_id'] : null;
            $displaySuggestionTargetUserId = mafia_displayed_suggestion_target_user_id($suggestion, $vote);
        }

        $players[] = [
            'user_id' => $userId,
            'username' => (string)$row['username'],
            'icon_key' => game_normalize_icon_key($row['icon_key'] ?? null),
            'is_self' => $userId === $viewerUserId,
            'is_alive' => $isAlive,
            'is_eliminated' => !$isAlive,
            'known_role' => $knownRole,
            'suggestion_target_user_id' => $suggestionTargetUserId,
            'display_suggestion_target_user_id' => $displaySuggestionTargetUserId,
            'vote_target_user_id' => $voteTargetUserId,
            'incoming_suggestion_usernames' => $incomingSuggestionUsernamesByTargetUserId[$userId] ?? [],
            'incoming_vote_usernames' => $incomingVoteUsernamesByTargetUserId[$userId] ?? [],
            'can_target_by_self' => in_array($userId, $eligibleTargets, true),
        ];
    }

    return $players;
}

function mafia_progress_action_type_for_phase(string $phase): ?string
{
    if ($phase === 'start') {
        return 'mafia_ready';
    }

    return mafia_vote_action_type_for_phase($phase);
}

function mafia_vote_action_type_for_phase(string $phase): ?string
{
    if ($phase === 'day') {
        return 'mafia_day_vote';
    }
    if ($phase === 'night') {
        return 'mafia_night_vote';
    }

    return null;
}

function mafia_suggestion_action_type_for_phase(string $phase): ?string
{
    if ($phase === 'day') {
        return 'mafia_day_suggest';
    }
    if ($phase === 'night') {
        return 'mafia_night_suggest';
    }

    return null;
}

function mafia_allowed_action_types_for_phase(string $phase): array
{
    $types = [];
    $progressActionType = mafia_progress_action_type_for_phase($phase);
    $suggestionActionType = mafia_suggestion_action_type_for_phase($phase);
    if ($progressActionType !== null) {
        $types[] = $progressActionType;
    }
    if ($suggestionActionType !== null) {
        $types[] = $suggestionActionType;
    }

    return $types;
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

function mafia_latest_phase_actions(int $gameId, int $roundNumber, string $actionType): array
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
            'action_id' => (int)$row['id'],
            'user_id' => $userId,
            'target_user_id' => isset($payload['target_user_id']) && (is_int($payload['target_user_id']) || ctype_digit((string)$payload['target_user_id']))
                ? (int)$payload['target_user_id']
                : null,
        ];
    }

    return $map;
}

function mafia_can_view_live_choices(string $gameStatus, string $phase, string $viewerRole, bool $viewerIsAlive): bool
{
    if ($gameStatus === 'closed') {
        return true;
    }

    if ($phase !== 'night') {
        return true;
    }

    return $viewerRole === 'mafia' && $viewerIsAlive;
}

function mafia_displayed_suggestion_target_user_id(?array $suggestion, ?array $vote): ?int
{
    $suggestionActionId = isset($suggestion['action_id']) ? (int)$suggestion['action_id'] : 0;
    $voteActionId = isset($vote['action_id']) ? (int)$vote['action_id'] : 0;
    $suggestionTargetUserId = isset($suggestion['target_user_id']) ? (int)$suggestion['target_user_id'] : null;
    $voteTargetUserId = isset($vote['target_user_id']) ? (int)$vote['target_user_id'] : null;

    if ($voteTargetUserId !== null && $voteActionId >= $suggestionActionId) {
        return $voteTargetUserId;
    }

    return $suggestionTargetUserId;
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

function mafia_active_vote_count_for_required_voters(array $submissionMap, array $requiredVoterIds): int
{
    $count = 0;
    foreach ($requiredVoterIds as $userId) {
        if (mafia_progress_action_is_complete_for_user('day', $userId, $submissionMap)) {
            $count += 1;
        }
    }

    return $count;
}

function mafia_action_has_target(?array $action): bool
{
    return is_array($action) && array_key_exists('target_user_id', $action) && $action['target_user_id'] !== null;
}

function mafia_action_targets_user(?array $action, int $targetUserId): bool
{
    return mafia_action_has_target($action) && (int)$action['target_user_id'] === $targetUserId;
}

function mafia_progress_action_is_complete_for_user(string $phase, int $userId, array $submissionMap): bool
{
    if (!isset($submissionMap[$userId])) {
        return false;
    }

    if ($phase === 'start') {
        return true;
    }

    return mafia_action_has_target($submissionMap[$userId]);
}

function mafia_majority_threshold(int $requiredCount): int
{
    return (int)floor($requiredCount / 2) + 1;
}

function mafia_majority_target_user_id(array $voteCounts, int $requiredCount): ?int
{
    if (empty($voteCounts) || $requiredCount <= 0) {
        return null;
    }

    $threshold = mafia_majority_threshold($requiredCount);
    if ((int)$voteCounts[0]['count'] < $threshold) {
        return null;
    }

    return (int)$voteCounts[0]['user_id'];
}

function mafia_phase_is_ready_to_resolve(string $phase, array $submissionMap, array $requiredVoterIds, array $voteCounts = []): bool
{
    if ($phase === 'start') {
        return mafia_submitted_count_for_required_voters($submissionMap, $requiredVoterIds) >= count($requiredVoterIds);
    }

    if (mafia_majority_target_user_id($voteCounts, count($requiredVoterIds)) !== null) {
        return true;
    }

    return mafia_active_vote_count_for_required_voters($submissionMap, $requiredVoterIds) >= count($requiredVoterIds);
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
        return 'Use Suggest to float a target and Vote to lock one in. A simple majority advances the phase immediately.';
    }
    if ($phase === 'night') {
        return 'Only living mafia can suggest and vote at night. A simple majority advances the phase immediately.';
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
        'SELECT gps.user_id, gps.final_rank, gps.eliminated_round, gps.elimination_order, gps.result_status, u.username, gm.icon_key '
        . 'FROM game_player_standings gps '
        . 'JOIN users u ON u.id = gps.user_id '
        . 'LEFT JOIN game_members gm ON gm.game_id = gps.game_id AND gm.user_id = gps.user_id '
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
            'icon_key' => isset($row['icon_key']) ? (string)$row['icon_key'] : null,
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

        $actionType = mafia_progress_action_type_for_phase($phase);
        if ($actionType === null) {
            return;
        }

        $requiredVoterIds = mafia_required_voter_ids($gameId, $phase, $roleMap);
        $submissionMap = mafia_latest_phase_actions($gameId, $roundNumber, $actionType);
        $voteCounts = $phase === 'start' ? [] : mafia_vote_counts($gameId, $submissionMap);
        if (!mafia_phase_is_ready_to_resolve($phase, $submissionMap, $requiredVoterIds, $voteCounts)) {
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
        $submissionMap = mafia_latest_phase_actions($gameId, $roundNumber, (string)mafia_progress_action_type_for_phase($phase));
        $voteCounts = $phase === 'start' ? [] : mafia_vote_counts($gameId, $submissionMap);
        if (!mafia_phase_is_ready_to_resolve($phase, $submissionMap, $requiredVoterIds, $voteCounts)) {
            $pdo->commit();
            return false;
        }

        if ($phase === 'start') {
            mafia_update_phase_state($gameId, 'day', $roundNumber, null);
            $pdo->commit();
            return true;
        }

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

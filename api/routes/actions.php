<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/game_access.php';
require_once __DIR__ . '/../lib/game_handlers.php';
require_once __DIR__ . '/../lib/game_types.php';
require_once __DIR__ . '/../lib/rumble.php';

function handle_actions_route(string $method, array $segments): void
{
    if (count($segments) === 3 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions') {
        $gameId = (int)$segments[1];

        if ($method === 'GET') {
            actions_list($gameId);
        }

        if ($method === 'POST') {
            actions_create($gameId);
        }

        error_response('Method not allowed.', 405);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'reveal') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        actions_force_reveal((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-order') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_upsert_order((int)$segments[1]);
    }

    if (count($segments) === 5 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-order' && $segments[4] === 'cancel') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_cancel_order((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-bids') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_upsert_bids((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-ship-name') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_upsert_ship_name((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-admin-grant-abilities') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_admin_grant_abilities_route((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-admin-revoke-abilities') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_admin_revoke_abilities_route((int)$segments[1]);
    }

    if (count($segments) === 4 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-admin-set-health') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_admin_set_health_route((int)$segments[1]);
    }

    if (count($segments) === 5 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-bids' && $segments[4] === 'cancel') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_cancel_bids((int)$segments[1]);
    }

    if (count($segments) === 5 && $segments[0] === 'games' && ctype_digit($segments[1]) && $segments[2] === 'actions' && $segments[3] === 'rumble-bids' && $segments[4] === 'end') {
        if ($method !== 'POST') {
            error_response('Method not allowed.', 405);
        }

        rumble_end_bidding((int)$segments[1]);
    }

    error_response('Not found.', 404);
}

function actions_list(int $gameId): void
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

    $stmt = db()->prepare(
        'SELECT a.id, a.action_type, a.payload, a.round_number, a.phase, a.revealed_at, a.created_at, u.id AS user_id, u.username '
        . 'FROM game_actions a '
        . 'JOIN users u ON u.id = a.user_id '
        . 'WHERE a.game_id = :game_id AND a.id > :since_id '
        . 'ORDER BY a.id ASC '
        . 'LIMIT 200'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'since_id' => $sinceId,
    ]);

    $rows = $stmt->fetchAll();
    $actions = [];
    foreach ($rows as $row) {
        if (!game_action_row_is_visible((string)$game['game_type'], $row)) {
            continue;
        }

        $payload = json_decode((string)$row['payload'], true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $actions[] = [
            'id' => (int)$row['id'],
            'action_type' => (string)$row['action_type'],
            'payload' => $payload,
            'round_number' => (int)$row['round_number'],
            'phase' => (string)$row['phase'],
            'revealed_at' => $row['revealed_at'] !== null ? (string)$row['revealed_at'] : null,
            'created_at' => (string)$row['created_at'],
            'user' => [
                'id' => (int)$row['user_id'],
                'username' => (string)$row['username'],
            ],
        ];
    }

    $lastId = $sinceId;
    if (!empty($rows)) {
        $last = end($rows);
        $lastId = (int)$last['id'];
    }

    success_response([
        'actions' => $actions,
        'last_id' => $lastId,
        'member_role' => $role,
    ]);
}

function actions_create(int $gameId): void
{
    $user = require_user();
    $role = game_require_member_or_403((int)$user['id'], $gameId);
    $stage = 'actions_create.member_role';

    if ($role === 'observer') {
        error_response('Observers cannot submit actions.', 403);
    }

    try {
        $stage = 'actions_create.load_game';
        $game = game_find_by_id($gameId);
        if ($game === null) {
            error_response('Game not found.', 404);
        }

        if ((string)$game['status'] !== 'in_progress') {
            error_response('Game actions are only allowed while game is in progress.', 409);
        }

        $stage = 'actions_create.parse_body';
        $body = json_input();
        $actionType = trim((string)($body['action_type'] ?? ''));
        $payload = $body['payload'] ?? [];
        if ($actionType === '' || strlen($actionType) > 40) {
            error_response('Action type is required and must be at most 40 characters.', 422);
        }

        if (!is_array($payload)) {
            error_response('Action payload must be an object.', 422);
        }

        $stage = 'actions_create.validate';
        game_action_validate_generic_create((string)$game['game_type'], $actionType, $gameId, (int)$user['id'], $payload);

        $stage = 'actions_create.load_state';
        $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
        $stateStmt->execute(['game_id' => $gameId]);
        $state = $stateStmt->fetch();

        $roundNumber = (int)($state['current_round'] ?? 1);
        $phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));

        $revealedAt = game_action_default_revealed_at((string)$game['game_type']);

        $stage = 'actions_create.insert';
        $insert = db()->prepare(
            'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
            . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
        );
        $insert->execute([
            'game_id' => $gameId,
            'user_id' => $user['id'],
            'action_type' => $actionType,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'round_number' => $roundNumber,
            'phase' => $phase,
            'revealed_at' => $revealedAt,
        ]);

        $stage = 'actions_create.after_create';
        game_action_after_generic_create((string)$game['game_type'], $gameId, $roundNumber, $actionType);

        success_response(['created' => true], 201);
    } catch (Throwable $ex) {
        if (isset($game) && is_array($game) && normalize_game_type((string)($game['game_type'] ?? '')) === 'mafia') {
            mafia_error_response('Unable to create mafia action.', 500, $stage, $ex, [
                'game_id' => $gameId,
                'user_id' => (int)$user['id'],
            ]);
        }

        throw $ex;
    }
}

function actions_force_reveal(int $gameId): void
{
    $user = require_user();

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $role = game_member_role((int)$user['id'], $gameId);
    $isOwner = (int)$game['owner_user_id'] === (int)$user['id'];
    $isAdmin = (int)($user['is_admin'] ?? 0) === 1;
    if ($role === null && !$isAdmin) {
        error_response('Only game members can perform this action.', 403);
    }

    if (!$isOwner && !$isAdmin) {
        error_response('Only the game owner or an admin can end the turn.', 403);
    }

    $type = normalize_game_type((string)$game['game_type']);
    $stage = 'resolve_type';
    $contextMeta = [
        'route' => 'actions_force_reveal',
        'game_id' => $gameId,
        'game_type' => $type,
    ];

    try {
        if ($type !== 'diplomacy') {
            if ($type !== 'rumble') {
                error_response('Turn resolution is only available for diplomacy and rumble games.', 409);
            }

            $stage = 'load_rumble_state';
            $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
            $stateStmt->execute(['game_id' => $gameId]);
            $state = $stateStmt->fetch();
            $roundNumber = (int)($state['current_round'] ?? 1);
            $phase = (string)($state['phase'] ?? 'bidding');
            $contextMeta['round'] = $roundNumber;
            $contextMeta['phase'] = $phase;

            if ($phase === 'bidding') {
                $stage = 'rumble_resolve_bidding';
                $resolved = rumble_resolve_bidding_and_enter_battle($gameId, $roundNumber);
                success_response(['resolved' => true, 'phase' => 'battle', 'count' => $resolved, 'round' => $roundNumber]);
            }

            $stage = 'rumble_resolve_round';
            $resolvedCount = rumble_resolve_round_and_advance($gameId, $roundNumber);
            success_response(['resolved' => true, 'phase' => 'battle', 'count' => $resolvedCount, 'round' => $roundNumber]);
        }

        $stage = 'load_diplomacy_round';
        $stateStmt = db()->prepare('SELECT current_round FROM game_state WHERE game_id = :game_id LIMIT 1');
        $stateStmt->execute(['game_id' => $gameId]);
        $roundNumber = (int)($stateStmt->fetchColumn() ?: 1);
        $contextMeta['round'] = $roundNumber;

        $stage = 'diplomacy_reveal_round';
        $revealedCount = diplomacy_reveal_round_and_advance($gameId, $roundNumber);

        success_response(['revealed' => true, 'count' => $revealedCount, 'round' => $roundNumber]);
    } catch (Throwable $ex) {
        error_response(
            'Reveal failed at ' . $stage . ': ' . $ex->getMessage(),
            500,
            array_merge($contextMeta, [
                'stage' => $stage,
                'exception_class' => get_class($ex),
                'exception_message' => $ex->getMessage(),
                'exception_file' => $ex->getFile(),
                'exception_line' => $ex->getLine(),
                'trace' => explode("\n", $ex->getTraceAsString()),
            ])
        );
    }
}

function rumble_admin_grant_abilities_route(int $gameId): void
{
    $user = require_user();
    if ((int)($user['is_admin'] ?? 0) !== 1) {
        error_response('Only admins can grant rumble abilities.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Rumble ability grants are only available while the game is in progress.', 409);
    }

    $body = json_input();
    $targetRaw = $body['user_id'] ?? null;
    if (!is_int($targetRaw) && !ctype_digit((string)$targetRaw)) {
        error_response('A valid target user_id is required.', 422);
    }

    $abilityIds = $body['ability_ids'] ?? null;
    if (!is_array($abilityIds)) {
        error_response('ability_ids must be an array.', 422);
    }

    $result = rumble_admin_grant_abilities($gameId, (int)$user['id'], (int)$targetRaw, $abilityIds);

    success_response([
        'granted' => true,
        'target_user_id' => $result['target_user_id'],
        'target_username' => $result['target_username'],
        'added_ability_ids' => $result['added_ability_ids'],
        'owned_ability_ids' => $result['owned_ability_ids'],
        'owned_abilities' => $result['owned_abilities'],
    ]);
}

function rumble_admin_revoke_abilities_route(int $gameId): void
{
    $user = require_user();
    if ((int)($user['is_admin'] ?? 0) !== 1) {
        error_response('Only admins can revoke rumble abilities.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Rumble ability revokes are only available while the game is in progress.', 409);
    }

    $body = json_input();
    $targetRaw = $body['user_id'] ?? null;
    if (!is_int($targetRaw) && !ctype_digit((string)$targetRaw)) {
        error_response('A valid target user_id is required.', 422);
    }

    $abilityIds = $body['ability_ids'] ?? null;
    if (!is_array($abilityIds)) {
        error_response('ability_ids must be an array.', 422);
    }

    $result = rumble_admin_revoke_abilities($gameId, (int)$user['id'], (int)$targetRaw, $abilityIds);

    success_response([
        'revoked' => true,
        'target_user_id' => $result['target_user_id'],
        'target_username' => $result['target_username'],
        'removed_ability_ids' => $result['removed_ability_ids'],
        'owned_ability_ids' => $result['owned_ability_ids'],
        'owned_abilities' => $result['owned_abilities'],
    ]);
}

function rumble_admin_set_health_route(int $gameId): void
{
    $user = require_user();
    if ((int)($user['is_admin'] ?? 0) !== 1) {
        error_response('Only admins can set rumble health.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Rumble health changes are only available while the game is in progress.', 409);
    }

    $body = json_input();
    $targetRaw = $body['user_id'] ?? null;
    if (!is_int($targetRaw) && !ctype_digit((string)$targetRaw)) {
        error_response('A valid target user_id is required.', 422);
    }

    $healthRaw = $body['health'] ?? null;
    if (!is_int($healthRaw) && !ctype_digit((string)$healthRaw)) {
        error_response('Health must be a non-negative integer.', 422);
    }

    $result = rumble_admin_set_health($gameId, (int)$user['id'], (int)$targetRaw, (int)$healthRaw);

    success_response([
        'updated' => true,
        'target_user_id' => $result['target_user_id'],
        'target_username' => $result['target_username'],
        'health' => $result['health'],
    ]);
}

function rumble_upsert_order(int $gameId): void
{
    rumble_action_upsert_order($gameId);
}

function rumble_upsert_bids(int $gameId): void
{
    rumble_action_upsert_bids($gameId);
}

function rumble_upsert_ship_name(int $gameId): void
{
    rumble_action_upsert_ship_name($gameId);
}

function rumble_cancel_bids(int $gameId): void
{
    rumble_action_cancel_bids($gameId);
}

function rumble_end_bidding(int $gameId): void
{
    rumble_action_end_bidding($gameId);
}

function rumble_maybe_auto_resolve_bidding(int $gameId, int $roundNumber): void
{
    rumble_action_maybe_auto_resolve_bidding($gameId, $roundNumber);
}

function rumble_current_offer(int $gameId, int $roundNumber): ?array
{
    return rumble_action_current_offer($gameId, $roundNumber);
}

function rumble_resolve_bidding_and_enter_battle(int $gameId, int $roundNumber): int
{
    return rumble_action_resolve_bidding_and_enter_battle($gameId, $roundNumber);
}

function rumble_cancel_order(int $gameId): void
{
    rumble_action_cancel_order($gameId);
}

function rumble_resolve_round_and_advance(int $gameId, int $roundNumber): int
{
    return rumble_action_resolve_round_and_advance($gameId, $roundNumber);
}


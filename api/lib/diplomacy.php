<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/game_types.php';
require_once __DIR__ . '/diplomacy/engine.php';

function diplomacy_starting_year(): int
{
    return 1901;
}

function diplomacy_game_row(int $gameId): ?array
{
    $stmt = db()->prepare(
        'SELECT g.id, g.owner_user_id, g.title, g.game_type, g.status, g.diplomacy_map_key, g.diplomacy_nation_mode, '
        . 'g.diplomacy_home_centers, g.diplomacy_assignments, g.diplomacy_timer_minutes, g.diplomacy_timer_shortcut, '
        . 'g.diplomacy_phase_deadline, gs.phase, gs.current_round, gs.winner_summary '
        . 'FROM games g '
        . 'LEFT JOIN game_state gs ON gs.game_id = g.id '
        . 'WHERE g.id = :id LIMIT 1'
    );
    $stmt->execute(['id' => $gameId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function diplomacy_player_members(int $gameId): array
{
    $stmt = db()->prepare(
        'SELECT gm.user_id, gm.role, gm.diplomacy_chosen_power, gm.diplomacy_assigned_power, u.username, u.is_active '
        . 'FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role '
        . 'ORDER BY gm.joined_at ASC, gm.user_id ASC'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    return $stmt->fetchAll() ?: [];
}

function diplomacy_nation_modes(): array
{
    return ['pick', 'random', 'assign_all', 'one_each', 'even'];
}

function diplomacy_assignments_from_row(?array $row): array
{
    if ($row === null) {
        return [];
    }
    $decoded = diplomacy_json_decode_column($row['diplomacy_assignments'] ?? null);
    return is_array($decoded) ? $decoded : [];
}

function diplomacy_active_player_ids(int $gameId): array
{
    $ids = [];
    foreach (diplomacy_player_members($gameId) as $row) {
        if ((int)($row['is_active'] ?? 1) === 1) {
            $ids[] = (int)$row['user_id'];
        }
    }
    return $ids;
}

function diplomacy_player_power_map(int $gameId): array
{
    $game = diplomacy_game_row($gameId);
    if ($game !== null && (string)($game['status'] ?? '') !== 'open') {
        $assignments = diplomacy_assignments_from_row($game);
        if ($assignments !== []) {
            $map = [];
            foreach ($assignments as $powerId => $userId) {
                if ($userId === null || $userId === '') {
                    continue;
                }
                $map[(string)$powerId] = (int)$userId;
            }
            return $map;
        }
    }

    $map = [];
    foreach (diplomacy_player_members($gameId) as $row) {
        if ((int)($row['is_active'] ?? 1) !== 1) {
            continue;
        }
        $power = trim((string)($row['diplomacy_assigned_power'] ?? ''));
        if ($power !== '') {
            $map[$power] = (int)$row['user_id'];
        }
    }
    return $map;
}

function diplomacy_powers_for_user(int $gameId, int $userId): array
{
    $powers = [];
    foreach (diplomacy_player_power_map($gameId) as $powerId => $assignedUserId) {
        if ($assignedUserId === $userId) {
            $powers[] = (string)$powerId;
        }
    }
    return $powers;
}

function diplomacy_parse_assignments(string $mode, $raw, array $powerIds, array $playerIds): array
{
    if (!is_array($raw)) {
        error_response('Diplomacy assignments must be an object.', 422);
    }
    $players = array_fill_keys($playerIds, true);
    $knownPowers = array_fill_keys($powerIds, true);
    $out = [];
    $usedUsers = [];
    foreach ($raw as $powerId => $userId) {
        $powerId = (string)$powerId;
        if (!isset($knownPowers[$powerId])) {
            error_response('Unknown power in assignments.', 422);
        }
        if (array_key_exists($powerId, $out)) {
            error_response('Each nation can be assigned once.', 422);
        }
        if ($userId === null || $userId === '' || $userId === 'civil') {
            $out[$powerId] = null;
            continue;
        }
        if (!is_int($userId) && !ctype_digit((string)$userId)) {
            error_response('Assignment player is invalid.', 422);
        }
        $uid = (int)$userId;
        if (!isset($players[$uid])) {
            error_response('Assignment player is not in this game.', 422);
        }
        if ($mode === 'one_each' && isset($usedUsers[$uid])) {
            error_response('Assign one faction to each player.', 422);
        }
        $usedUsers[$uid] = true;
        $out[$powerId] = $uid;
    }
    return $out;
}

function diplomacy_complete_assignments(array $assignments, array $powerIds): array
{
    $complete = [];
    foreach ($powerIds as $powerId) {
        $complete[$powerId] = array_key_exists($powerId, $assignments) ? $assignments[$powerId] : null;
    }
    return $complete;
}

function diplomacy_assert_start_assignments(string $mode, array $assignments, array $powerIds, array $playerIds): void
{
    if ($mode === 'assign_all') {
        foreach ($powerIds as $powerId) {
            if (!array_key_exists($powerId, $assignments)) {
                error_response('Assign every nation, including civil disorder.', 409);
            }
        }
    }
    if ($mode === 'one_each') {
        if (count($playerIds) > count($powerIds)) {
            error_response('Too many players to assign one faction each.', 409);
        }
        $seen = [];
        foreach ($assignments as $userId) {
            if ($userId === null || $userId === '') {
                continue;
            }
            $seen[(int)$userId] = true;
        }
        foreach ($playerIds as $playerId) {
            if (!isset($seen[$playerId])) {
                error_response('Assign one faction to each player before starting.', 409);
            }
        }
    }
}

function diplomacy_timer_minutes_from_body(array $body): ?int
{
    if (!array_key_exists('diplomacy_timer_minutes', $body) || $body['diplomacy_timer_minutes'] === null || $body['diplomacy_timer_minutes'] === '') {
        return null;
    }
    $raw = $body['diplomacy_timer_minutes'];
    if (!is_int($raw) && !ctype_digit((string)$raw)) {
        error_response('Timer minutes must be a whole number.', 422);
    }
    $minutes = (int)$raw;
    if ($minutes < 1 || $minutes > 10080) {
        error_response('Timer minutes must be between 1 and 10080.', 422);
    }
    return $minutes;
}

function diplomacy_set_phase_deadline(int $gameId, ?int $minutes): void
{
    if ($minutes === null || $minutes < 1) {
        db()->prepare('UPDATE games SET diplomacy_phase_deadline = NULL WHERE id = :id')->execute(['id' => $gameId]);
        return;
    }
    $minutes = (int)$minutes;
    if (db_is_sqlite()) {
        db()->prepare(
            'UPDATE games SET diplomacy_phase_deadline = datetime(\'now\', \'+' . $minutes . ' minutes\') WHERE id = :id'
        )->execute(['id' => $gameId]);
        return;
    }
    db()->prepare(
        'UPDATE games SET diplomacy_phase_deadline = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ' . $minutes . ' MINUTE) WHERE id = :id'
    )->execute(['id' => $gameId]);
}

function diplomacy_deadline_timestamp(?string $raw): ?int
{
    if ($raw === null || trim($raw) === '') {
        return null;
    }
    $ts = strtotime(trim($raw) . ' UTC');
    return $ts === false ? null : $ts;
}

function diplomacy_deadline_iso(?string $raw): ?string
{
    $ts = diplomacy_deadline_timestamp($raw);
    if ($ts === null) {
        return null;
    }
    return gmdate('Y-m-d\TH:i:s\Z', $ts);
}

function diplomacy_write_member_powers(int $gameId, array $players, array $powerToUser): void
{
    $firstByUser = [];
    foreach ($powerToUser as $powerId => $userId) {
        if ($userId === null || $userId === '') {
            continue;
        }
        $uid = (int)$userId;
        if (!isset($firstByUser[$uid])) {
            $firstByUser[$uid] = (string)$powerId;
        }
    }
    $pdo = db();
    $assignStmt = $pdo->prepare(
        'UPDATE game_members SET diplomacy_assigned_power = :power WHERE game_id = :game_id AND user_id = :user_id'
    );
    $clearStmt = $pdo->prepare(
        'UPDATE game_members SET diplomacy_assigned_power = NULL WHERE game_id = :game_id AND user_id = :user_id'
    );
    foreach ($players as $player) {
        $userId = (int)$player['user_id'];
        if (!isset($firstByUser[$userId])) {
            $clearStmt->execute(['game_id' => $gameId, 'user_id' => $userId]);
            continue;
        }
        $assignStmt->execute([
            'power' => $firstByUser[$userId],
            'game_id' => $gameId,
            'user_id' => $userId,
        ]);
    }
}

function diplomacy_freeze_assignments(int $gameId, array $players, array $powerToUser): void
{
    $stmt = db()->prepare('UPDATE games SET diplomacy_assignments = :assignments WHERE id = :id');
    $stmt->execute([
        'assignments' => json_encode($powerToUser, JSON_UNESCAPED_UNICODE),
        'id' => $gameId,
    ]);
    diplomacy_write_member_powers($gameId, $players, $powerToUser);
}

function diplomacy_update_settings(int $gameId, array $body): void
{
    $mapKey = trim((string)($body['diplomacy_map_key'] ?? diplomacy_default_map_key()));
    $nationMode = trim((string)($body['diplomacy_nation_mode'] ?? 'pick'));
    if (!in_array($nationMode, diplomacy_nation_modes(), true)) {
        error_response('Invalid diplomacy_nation_mode.', 422);
    }
    if (!diplomacy_map_exists($mapKey)) {
        error_response('Unknown diplomacy map.', 422);
    }
    $minutes = diplomacy_timer_minutes_from_body($body);
    $shortcut = !empty($body['diplomacy_timer_shortcut']) ? 1 : 0;

    $entry = diplomacy_map_catalog_entry($mapKey);
    $powerIds = [];
    foreach ((array)($entry['powers'] ?? []) as $power) {
        $powerIds[] = (string)$power['id'];
    }
    $assignmentsJson = null;
    if (in_array($nationMode, ['assign_all', 'one_each', 'even'], true)) {
        $parsed = diplomacy_parse_assignments(
            $nationMode,
            $body['diplomacy_assignments'] ?? [],
            $powerIds,
            diplomacy_active_player_ids($gameId)
        );
        $assignmentsJson = json_encode(diplomacy_complete_assignments($parsed, $powerIds), JSON_UNESCAPED_UNICODE);
    }

    $stmt = db()->prepare(
        'UPDATE games SET diplomacy_map_key = :map_key, diplomacy_nation_mode = :nation_mode, '
        . 'diplomacy_assignments = :assignments, diplomacy_timer_minutes = :timer_minutes, '
        . 'diplomacy_timer_shortcut = :timer_shortcut WHERE id = :id'
    );
    $stmt->execute([
        'map_key' => $mapKey,
        'nation_mode' => $nationMode,
        'assignments' => $assignmentsJson,
        'timer_minutes' => $minutes,
        'timer_shortcut' => $shortcut,
        'id' => $gameId,
    ]);

    $entry = diplomacy_map_catalog_entry($mapKey);
    $valid = [];
    foreach ((array)($entry['powers'] ?? []) as $power) {
        $valid[(string)$power['id']] = true;
    }
    $members = diplomacy_player_members($gameId);
    $clear = db()->prepare(
        'UPDATE game_members SET diplomacy_chosen_power = NULL '
        . 'WHERE game_id = :game_id AND user_id = :user_id'
    );
    foreach ($members as $member) {
        $chosen = trim((string)($member['diplomacy_chosen_power'] ?? ''));
        if ($chosen === '' || $chosen === 'random' || isset($valid[$chosen])) {
            continue;
        }
        $clear->execute([
            'game_id' => $gameId,
            'user_id' => (int)$member['user_id'],
        ]);
    }
}

function diplomacy_set_chosen_power(int $gameId, int $userId, $powerRaw): void
{
    $game = diplomacy_game_row($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }
    if ((string)$game['status'] !== 'open') {
        error_response('Nation selection is only available while the game is open.', 409);
    }
    if ((string)($game['diplomacy_nation_mode'] ?? 'pick') !== 'pick') {
        error_response('Nation selection is only available when players pick nations.', 409);
    }

    $power = strtolower(trim((string)$powerRaw));
    if ($power === '') {
        $power = 'random';
    }

    $entry = diplomacy_map_catalog_entry((string)($game['diplomacy_map_key'] ?? diplomacy_default_map_key()));
    $valid = ['random' => true];
    foreach ((array)($entry['powers'] ?? []) as $item) {
        $valid[strtolower((string)$item['id'])] = true;
    }
    if (!isset($valid[$power])) {
        error_response('Unknown power.', 422);
    }

    if ($power !== 'random') {
        $taken = db()->prepare(
            'SELECT user_id FROM game_members '
            . 'WHERE game_id = :game_id AND diplomacy_chosen_power = :power AND user_id <> :user_id AND role <> :observer_role LIMIT 1'
        );
        $taken->execute([
            'game_id' => $gameId,
            'power' => $power,
            'user_id' => $userId,
            'observer_role' => 'observer',
        ]);
        if ($taken->fetchColumn()) {
            error_response('That nation is already claimed.', 409);
        }
    }

    $stmt = db()->prepare(
        'UPDATE game_members SET diplomacy_chosen_power = :power WHERE game_id = :game_id AND user_id = :user_id'
    );
    $stmt->execute([
        'power' => $power,
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);
}

function diplomacy_validate_can_start(int $gameId): void
{
    $game = diplomacy_game_row($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }
    $mapKey = (string)($game['diplomacy_map_key'] ?? diplomacy_default_map_key());
    $entry = diplomacy_map_catalog_entry($mapKey);
    if ($entry === null) {
        error_response('Choose a valid map before starting.', 409);
    }
    $players = [];
    foreach (diplomacy_player_members($gameId) as $row) {
        if ((int)($row['is_active'] ?? 1) === 1) {
            $players[] = $row;
        }
    }
    if (count($players) < 1) {
        error_response('Diplomacy needs at least one player.', 409);
    }
    $nationMode = (string)($game['diplomacy_nation_mode'] ?? 'pick');
    if (!in_array($nationMode, ['assign_all', 'one_each', 'even'], true) && count($players) > (int)$entry['power_count']) {
        error_response('Too many players for this map.', 409);
    }
}

function diplomacy_seeded_shuffle(array $items, int $gameId, string $context): array
{
    $items = array_values($items);
    $n = count($items);
    for ($i = $n - 1; $i > 0; $i--) {
        $j = deterministic_choice_index('v1:game:' . $gameId . ':ctx:' . $context . ':i:' . $i, $i + 1);
        $tmp = $items[$i];
        $items[$i] = $items[$j];
        $items[$j] = $tmp;
    }
    return $items;
}

function diplomacy_game_on_start(int $gameId, int $actorUserId): void
{
    unset($actorUserId);
    diplomacy_validate_can_start($gameId);
    $game = diplomacy_game_row($gameId);
    $mapKey = (string)($game['diplomacy_map_key'] ?? diplomacy_default_map_key());
    $loaded = diplomacy_load_map($mapKey);
    $powers = [];
    foreach ((array)($loaded['start']['powers'] ?? []) as $power) {
        $powers[] = (string)$power['id'];
    }

    $nationMode = (string)($game['diplomacy_nation_mode'] ?? 'pick');
    $players = [];
    foreach (diplomacy_player_members($gameId) as $row) {
        if ((int)($row['is_active'] ?? 1) === 1) {
            $players[] = $row;
        }
    }
    $playerIds = [];
    foreach ($players as $player) {
        $playerIds[] = (int)$player['user_id'];
    }

    $assigned = [];
    if (in_array($nationMode, ['assign_all', 'one_each', 'even'], true)) {
        $saved = diplomacy_assignments_from_row($game);
        $assigned = diplomacy_parse_assignments($nationMode, $saved, $powers, $playerIds);
        diplomacy_assert_start_assignments($nationMode, $assigned, $powers, $playerIds);
    } else {
        $remainingPlayers = [];
        if ($nationMode === 'pick') {
            foreach ($players as $player) {
                $chosen = strtolower(trim((string)($player['diplomacy_chosen_power'] ?? '')));
                if ($chosen !== '' && $chosen !== 'random' && in_array($chosen, $powers, true) && !isset($assigned[$chosen])) {
                    $assigned[$chosen] = (int)$player['user_id'];
                } else {
                    $remainingPlayers[] = $player;
                }
            }
        } else {
            $remainingPlayers = $players;
        }

        $remainingPowers = [];
        foreach ($powers as $powerId) {
            if (!isset($assigned[$powerId])) {
                $remainingPowers[] = $powerId;
            }
        }
        $remainingPowers = diplomacy_seeded_shuffle($remainingPowers, $gameId, 'powers');
        foreach ($remainingPlayers as $index => $player) {
            if (!isset($remainingPowers[$index])) {
                error_response('Too many players for this map.', 409);
            }
            $assigned[$remainingPowers[$index]] = (int)$player['user_id'];
        }
    }

    $assigned = diplomacy_complete_assignments($assigned, $powers);
    diplomacy_freeze_assignments($gameId, $players, $assigned);

    $pdo = db();
    $homes = diplomacy_home_centers_from_start($loaded['graph'], $loaded['start']);
    $homeStmt = $pdo->prepare('UPDATE games SET diplomacy_home_centers = :homes WHERE id = :id');
    $homeStmt->execute([
        'homes' => json_encode($homes, JSON_UNESCAPED_UNICODE),
        'id' => $gameId,
    ]);

    $year = diplomacy_starting_year();
    $phase = 'spring_orders';
    $stateStmt = $pdo->prepare(
        'UPDATE game_state SET phase = :phase, current_round = :year WHERE game_id = :game_id'
    );
    $stateStmt->execute([
        'phase' => $phase,
        'year' => $year,
        'game_id' => $gameId,
    ]);

    diplomacy_write_snapshot($gameId, $year, $phase, $loaded['start'], null, null);
    $minutes = $game['diplomacy_timer_minutes'] ?? null;
    diplomacy_set_phase_deadline($gameId, $minutes === null || $minutes === '' ? null : (int)$minutes);
}

function diplomacy_write_snapshot(int $gameId, int $year, string $phase, array $position, ?array $orders, ?array $resolution): void
{
    $stmt = db()->prepare(db_upsert_sql(
        'INSERT INTO diplomacy_phase_snapshots (game_id, year, phase, position, orders, resolution) '
        . 'VALUES (:game_id, :year, :phase, :position, :orders, :resolution)',
        ['game_id', 'year', 'phase'],
        [
            'position' => ':position_update',
            'orders' => ':orders_update',
            'resolution' => ':resolution_update',
        ]
    ));
    $stmt->execute([
        'game_id' => $gameId,
        'year' => $year,
        'phase' => $phase,
        'position' => json_encode($position, JSON_UNESCAPED_UNICODE),
        'orders' => $orders === null ? null : json_encode($orders, JSON_UNESCAPED_UNICODE),
        'resolution' => $resolution === null ? null : json_encode($resolution, JSON_UNESCAPED_UNICODE),
        'position_update' => json_encode($position, JSON_UNESCAPED_UNICODE),
        'orders_update' => $orders === null ? null : json_encode($orders, JSON_UNESCAPED_UNICODE),
        'resolution_update' => $resolution === null ? null : json_encode($resolution, JSON_UNESCAPED_UNICODE),
    ]);
}

function diplomacy_current_snapshot(int $gameId, int $year, string $phase): ?array
{
    $stmt = db()->prepare(
        'SELECT id, year, phase, position, orders, resolution FROM diplomacy_phase_snapshots '
        . 'WHERE game_id = :game_id AND year = :year AND phase = :phase LIMIT 1'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'year' => $year,
        'phase' => $phase,
    ]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return [
        'id' => (int)$row['id'],
        'year' => (int)$row['year'],
        'phase' => (string)$row['phase'],
        'position' => diplomacy_json_decode_column($row['position']) ?: [],
        'orders' => diplomacy_json_decode_column($row['orders']),
        'resolution' => diplomacy_json_decode_column($row['resolution']),
    ];
}

function diplomacy_history_index(int $gameId): array
{
    $stmt = db()->prepare(
        'SELECT year, phase FROM diplomacy_phase_snapshots '
        . 'WHERE game_id = :game_id AND resolution IS NOT NULL '
        . 'ORDER BY year ASC, id ASC'
    );
    $stmt->execute(['game_id' => $gameId]);
    $rows = $stmt->fetchAll() ?: [];
    $items = [];
    foreach ($rows as $row) {
        $year = (int)$row['year'];
        $phase = (string)$row['phase'];
        $items[] = [
            'year' => $year,
            'phase' => $phase,
            'label' => diplomacy_phase_label($phase, $year),
            'mode' => diplomacy_phase_mode($phase),
        ];
    }
    return $items;
}

function diplomacy_snapshot_for_history(int $gameId, int $year, string $phase): ?array
{
    $row = diplomacy_current_snapshot($gameId, $year, $phase);
    if ($row === null || $row['resolution'] === null) {
        return null;
    }
    return $row;
}

function diplomacy_load_phase_actions(int $gameId, int $year, string $phase): array
{
    $stmt = db()->prepare(
        'SELECT user_id, action_type, payload, revealed_at FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :year AND phase = :phase '
        . "AND action_type IN ('order', 'retreat', 'adjust')"
    );
    $stmt->execute([
        'game_id' => $gameId,
        'year' => $year,
        'phase' => $phase,
    ]);
    $rows = $stmt->fetchAll() ?: [];
    $out = [];
    foreach ($rows as $row) {
        $payload = diplomacy_json_decode_column($row['payload']) ?: [];
        $out[] = [
            'user_id' => (int)$row['user_id'],
            'action_type' => (string)$row['action_type'],
            'payload' => $payload,
            'revealed_at' => $row['revealed_at'],
        ];
    }
    return $out;
}

function diplomacy_submit(int $gameId, int $userId, string $actionType, array $payload): void
{
    $game = diplomacy_game_row($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }
    if ((string)$game['status'] !== 'in_progress') {
        error_response('Game actions are only allowed while game is in progress.', 409);
    }

    $year = (int)($game['current_round'] ?? diplomacy_starting_year());
    $phase = (string)($game['phase'] ?? 'spring_orders');
    $expected = diplomacy_phase_action_type($phase);
    if ($actionType !== $expected) {
        error_response('That order type is not valid in this phase.', 409);
    }

    $myPowers = diplomacy_powers_for_user($gameId, $userId);
    if ($myPowers === []) {
        error_response('You do not have a nation in this game.', 403);
    }
    $powerId = (string)($payload['power'] ?? '');
    if (!in_array($powerId, $myPowers, true)) {
        error_response('Orders must be for your assigned power.', 422);
    }

    $loaded = diplomacy_load_map((string)$game['diplomacy_map_key']);
    $snapshot = diplomacy_current_snapshot($gameId, $year, $phase);
    if ($snapshot === null) {
        error_response('Diplomacy position is missing.', 500);
    }
    $position = $snapshot['position'];
    diplomacy_canonicalize_position($loaded['graph'], $position);

    $kind = (string)($payload['kind'] ?? '');
    if ($expected === 'order' && $kind !== 'diplomacy-orders') {
        error_response('Expected a diplomacy-orders document.', 422);
    }
    if ($expected === 'retreat' && $kind !== 'diplomacy-retreats') {
        error_response('Expected a diplomacy-retreats document.', 422);
    }
    if ($expected === 'adjust' && $kind !== 'diplomacy-adjustments') {
        error_response('Expected a diplomacy-adjustments document.', 422);
    }
    $payload['map'] = $loaded['graph']['source'] ?? $payload['map'] ?? '';
    $orders = isset($payload['orders']) && is_array($payload['orders']) ? $payload['orders'] : [];
    foreach ($orders as &$order) {
        if (is_array($order)) {
            diplomacy_canonicalize_order($loaded['graph'], $order);
        }
    }
    unset($order);
    $payload['orders'] = $orders;

    if ($expected === 'order') {
        foreach ($orders as $order) {
            if (!is_array($order)) {
                continue;
            }
            $standing = diplomacy_unit_at((array)$position['units'], $order['province'] ?? null);
            if ($standing === null || ($standing['power'] ?? null) !== $powerId) {
                error_response('Every order must be for one of your units.', 422);
            }
            $normalized = diplomacy_copy_order($order, $standing);
            if (!diplomacy_is_legal_order($loaded['graph'], $position, $normalized)) {
                error_response('Illegal order from ' . ($order['province'] ?? 'unknown') . '.', 422);
            }
        }
    } elseif ($expected === 'retreat') {
        $retreats = diplomacy_current_choices($gameId, $game, $loaded, $snapshot)['retreats'];
        $mine = array_values(array_filter($retreats, static fn ($entry) => ($entry['power'] ?? null) === $powerId));
        diplomacy_assert_retreats($loaded['graph'], $payload, $mine, $powerId);
    } else {
        $adjustments = (array)($snapshot['resolution']['adjustments'] ?? diplomacy_current_choices($gameId, $game, $loaded, $snapshot)['adjustments']);
        diplomacy_assert_adjustments($loaded['graph'], $payload, $adjustments, $powerId);
    }

    $existingId = diplomacy_find_phase_action_id($gameId, $userId, $year, $phase, $actionType, $powerId);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($existingId) {
        $update = db()->prepare('UPDATE game_actions SET payload = :payload, revealed_at = NULL WHERE id = :id');
        $update->execute(['payload' => $json, 'id' => $existingId]);
    } else {
        $insert = db()->prepare(
            'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
            . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, NULL)'
        );
        $insert->execute([
            'game_id' => $gameId,
            'user_id' => $userId,
            'action_type' => $actionType,
            'payload' => $json,
            'round_number' => $year,
            'phase' => $phase,
        ]);
    }

    diplomacy_clear_ready($gameId, $userId, $year, $phase);
}

function diplomacy_find_phase_action_id(int $gameId, int $userId, int $year, string $phase, string $actionType, ?string $powerId): ?int
{
    $stmt = db()->prepare(
        'SELECT id, payload FROM game_actions '
        . 'WHERE game_id = :game_id AND user_id = :user_id AND round_number = :year AND phase = :phase AND action_type = :action_type'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $userId,
        'year' => $year,
        'phase' => $phase,
        'action_type' => $actionType,
    ]);
    $rows = $stmt->fetchAll() ?: [];
    foreach ($rows as $row) {
        if ($actionType === 'ready') {
            return (int)$row['id'];
        }
        $payload = diplomacy_json_decode_column($row['payload']) ?: [];
        if ((string)($payload['power'] ?? '') === (string)$powerId) {
            return (int)$row['id'];
        }
    }
    return null;
}

function diplomacy_clear_ready(int $gameId, int $userId, int $year, string $phase): void
{
    $stmt = db()->prepare(
        'DELETE FROM game_actions '
        . 'WHERE game_id = :game_id AND user_id = :user_id AND round_number = :year AND phase = :phase AND action_type = :action_type'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $userId,
        'year' => $year,
        'phase' => $phase,
        'action_type' => 'ready',
    ]);
}

function diplomacy_ready_user_ids(int $gameId, int $year, string $phase): array
{
    $stmt = db()->prepare(
        'SELECT user_id FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :year AND phase = :phase AND action_type = :action_type'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'year' => $year,
        'phase' => $phase,
        'action_type' => 'ready',
    ]);
    $ids = [];
    foreach ($stmt->fetchAll() ?: [] as $row) {
        $ids[(int)$row['user_id']] = true;
    }
    return $ids;
}

function diplomacy_set_ready(int $gameId, int $userId, bool $ready): void
{
    $game = diplomacy_game_row($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }
    if ((string)$game['status'] !== 'in_progress') {
        error_response('Game actions are only allowed while game is in progress.', 409);
    }
    if (diplomacy_powers_for_user($gameId, $userId) === []) {
        error_response('You do not have a nation in this game.', 403);
    }

    $year = (int)($game['current_round'] ?? diplomacy_starting_year());
    $phase = (string)($game['phase'] ?? 'spring_orders');
    $loaded = diplomacy_load_map((string)$game['diplomacy_map_key']);
    $snapshot = diplomacy_current_snapshot($gameId, $year, $phase);
    if ($snapshot === null) {
        error_response('Diplomacy position is missing.', 500);
    }
    $required = diplomacy_required_user_ids($gameId, $game, $loaded, $snapshot);
    if (!in_array($userId, $required, true)) {
        error_response('You have nothing to order this phase.', 409);
    }

    if ($ready) {
        $existingId = diplomacy_find_phase_action_id($gameId, $userId, $year, $phase, 'ready', null);
        if (!$existingId) {
            $insert = db()->prepare(
                'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
                . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, NULL)'
            );
            $insert->execute([
                'game_id' => $gameId,
                'user_id' => $userId,
                'action_type' => 'ready',
                'payload' => '{}',
                'round_number' => $year,
                'phase' => $phase,
            ]);
        }
        diplomacy_maybe_auto_resolve($gameId);
        return;
    }

    diplomacy_clear_ready($gameId, $userId, $year, $phase);
}

function diplomacy_assert_retreats(array &$graph, array $doc, array $retreats, string $powerId): void
{
    $used = [];
    foreach ((array)($doc['orders'] ?? []) as $order) {
        if (!is_array($order) || empty($order['province'])) {
            error_response('Every retreat needs a province.', 422);
        }
        $provinceId = diplomacy_province_id($graph, $order['province']);
        if (isset($used[$provinceId])) {
            error_response('Two retreats from the same province.', 422);
        }
        $used[$provinceId] = true;
        $entry = null;
        foreach ($retreats as $item) {
            if (diplomacy_province_id($graph, $item['province'] ?? '') === $provinceId) {
                $entry = $item;
                break;
            }
        }
        if ($entry === null) {
            error_response('No retreat offered for ' . $order['province'] . '.', 422);
        }
        if (($entry['power'] ?? null) !== $powerId) {
            error_response('That retreat is not yours.', 422);
        }
        $action = (string)($order['action'] ?? '');
        if ($action === 'retreat') {
            $to = diplomacy_province_id($graph, $order['to'] ?? '');
            $allowed = false;
            foreach ((array)($entry['choices'] ?? []) as $choice) {
                if (diplomacy_province_id($graph, $choice) === $to) {
                    $allowed = true;
                }
            }
            if (!$allowed) {
                error_response('Retreat destination is not one of the choices.', 422);
            }
        } elseif ($action === 'disband') {
            if (empty($entry['disband'])) {
                error_response('Disband is not offered for that unit.', 422);
            }
        } else {
            error_response('Unknown retreat order.', 422);
        }
    }
}

function diplomacy_assert_adjustments(array &$graph, array $doc, array $adjustments, string $powerId): void
{
    $entry = null;
    foreach ($adjustments as $item) {
        if (($item['power'] ?? null) === $powerId) {
            $entry = $item;
            break;
        }
    }
    if ($entry === null) {
        error_response('No adjustment offered for your power.', 422);
    }
    $count = (int)($entry['count'] ?? 0);
    $builds = 0;
    $disbands = 0;
    $used = [];
    foreach ((array)($doc['orders'] ?? []) as $order) {
        if (!is_array($order) || empty($order['province'])) {
            error_response('Every adjustment needs a province.', 422);
        }
        $provinceId = diplomacy_province_id($graph, $order['province']);
        if (isset($used[$provinceId])) {
            error_response('Two adjustments in the same province.', 422);
        }
        $used[$provinceId] = true;
        $action = (string)($order['action'] ?? '');
        if ($action === 'build') {
            $offered = false;
            foreach ((array)($entry['builds'] ?? []) as $build) {
                if (diplomacy_province_id($graph, $build['province']) === $provinceId && ($build['unit'] ?? '') === ($order['unit'] ?? '')) {
                    $offered = true;
                }
            }
            if (!$offered) {
                error_response('Build is not one of the choices.', 422);
            }
            $builds += 1;
        } elseif ($action === 'disband') {
            $ok = false;
            foreach ((array)($entry['disbands'] ?? []) as $id) {
                if (diplomacy_province_id($graph, $id) === $provinceId) {
                    $ok = true;
                }
            }
            if (!$ok) {
                error_response('Disband is not one of the choices.', 422);
            }
            $disbands += 1;
        } else {
            error_response('Unknown adjustment.', 422);
        }
    }
    if ($count > 0 && ($disbands > 0 || $builds > $count)) {
        error_response('That adjustment allows ' . $count . ' builds.', 422);
    }
    if ($count < 0 && ($builds > 0 || $disbands > -$count)) {
        error_response('That adjustment allows ' . (-$count) . ' disbands.', 422);
    }
    if ($count === 0 && (($doc['orders'] ?? []) !== [])) {
        error_response('That power has no adjustment.', 422);
    }
}

function diplomacy_prior_movement_snapshot(int $gameId, int $year, string $phase): ?array
{
    if ($phase === 'spring_retreats') {
        return diplomacy_current_snapshot($gameId, $year, 'spring_orders');
    }
    if ($phase === 'fall_retreats') {
        return diplomacy_current_snapshot($gameId, $year, 'fall_orders');
    }
    return null;
}

function diplomacy_current_choices(int $gameId, array $game, array $loaded, array $snapshot): array
{
    $phase = (string)$snapshot['phase'];
    $playerPowers = diplomacy_player_power_map($gameId);
    $homes = diplomacy_json_decode_column($game['diplomacy_home_centers'] ?? null) ?: [];
    if ($homes === []) {
        $homes = diplomacy_home_centers_from_start($loaded['graph'], $loaded['start']);
    }
    $retreats = [];
    $adjustments = [];
    if (diplomacy_phase_mode($phase) === 'retreat') {
        $prior = $snapshot['resolution'] ?? null;
        if (!is_array($prior) || !isset($prior['units'])) {
            $priorSnap = diplomacy_prior_movement_snapshot($gameId, (int)$snapshot['year'], $phase);
            $prior = is_array($priorSnap) ? ($priorSnap['resolution'] ?? null) : null;
        }
        if (is_array($prior) && isset($prior['units'])) {
            $retreats = diplomacy_retreat_choices($loaded['graph'], $snapshot['position'], $prior);
        }
    }
    if ($phase === 'builds') {
        $adjustments = diplomacy_adjustment_choices($loaded['graph'], $snapshot['position'], $homes, $playerPowers);
    }
    return [
        'retreats' => $retreats,
        'adjustments' => $adjustments,
        'homes' => $homes,
        'player_powers' => $playerPowers,
    ];
}

function diplomacy_required_user_ids(int $gameId, array $game, array $loaded, array $snapshot): array
{
    $phase = (string)$snapshot['phase'];
    $playerPowers = diplomacy_player_power_map($gameId);
    $required = [];
    if (diplomacy_phase_mode($phase) === 'orders') {
        $powersWithUnits = [];
        foreach ((array)($snapshot['position']['units'] ?? []) as $unit) {
            if (is_array($unit) && !empty($unit['power'])) {
                $powersWithUnits[$unit['power']] = true;
            }
        }
        foreach ($playerPowers as $powerId => $userId) {
            if (isset($powersWithUnits[$powerId])) {
                $required[$userId] = true;
            }
        }
    } elseif (diplomacy_phase_mode($phase) === 'retreat') {
        $choices = diplomacy_current_choices($gameId, $game, $loaded, $snapshot);
        foreach ($choices['retreats'] as $entry) {
            $userId = $playerPowers[$entry['power'] ?? ''] ?? null;
            if ($userId) {
                $required[$userId] = true;
            }
        }
    } else {
        $choices = diplomacy_current_choices($gameId, $game, $loaded, $snapshot);
        foreach ($choices['adjustments'] as $entry) {
            $userId = $playerPowers[$entry['power'] ?? ''] ?? null;
            if ($userId) {
                $required[$userId] = true;
            }
        }
    }
    return array_keys($required);
}

function diplomacy_maybe_auto_resolve(int $gameId): void
{
    $game = diplomacy_game_row($gameId);
    if ($game === null || (string)$game['status'] !== 'in_progress') {
        return;
    }
    $year = (int)$game['current_round'];
    $phase = (string)$game['phase'];
    $loaded = diplomacy_load_map((string)$game['diplomacy_map_key']);
    $snapshot = diplomacy_current_snapshot($gameId, $year, $phase);
    if ($snapshot === null) {
        return;
    }
    $required = diplomacy_required_user_ids($gameId, $game, $loaded, $snapshot);
    if ($required === []) {
        diplomacy_resolve_current_phase($gameId);
        return;
    }
    $ready = diplomacy_ready_user_ids($gameId, $year, $phase);
    foreach ($required as $userId) {
        if (!isset($ready[(int)$userId])) {
            return;
        }
    }
    diplomacy_resolve_current_phase($gameId);
}

function diplomacy_resolve_current_phase(int $gameId): int
{
    $game = diplomacy_game_row($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }
    if ((string)$game['status'] !== 'in_progress') {
        error_response('Only in-progress games can be resolved.', 409);
    }
    $year = (int)$game['current_round'];
    $phase = (string)$game['phase'];
    if ($phase === 'setup') {
        error_response('The game has not started.', 409);
    }

    $loaded = diplomacy_load_map((string)$game['diplomacy_map_key']);
    $snapshot = diplomacy_current_snapshot($gameId, $year, $phase);
    if ($snapshot === null) {
        error_response('Diplomacy position is missing.', 500);
    }
    $position = $snapshot['position'];
    diplomacy_canonicalize_position($loaded['graph'], $position);
    $playerPowers = diplomacy_player_power_map($gameId);
    $homes = diplomacy_json_decode_column($game['diplomacy_home_centers'] ?? null) ?: diplomacy_home_centers_from_start($loaded['graph'], $loaded['start']);
    $actions = diplomacy_load_phase_actions($gameId, $year, $phase);
    $docs = [];
    foreach ($actions as $row) {
        $docs[] = $row['payload'];
    }

    $pdo = db();
    $startedTx = !$pdo->inTransaction();
    if ($startedTx) {
        $pdo->beginTransaction();
    }
    try {
        $reveal = $pdo->prepare(
            'UPDATE game_actions SET revealed_at = ' . db_now_sql() . ' '
            . 'WHERE game_id = :game_id AND round_number = :year AND phase = :phase AND revealed_at IS NULL'
        );
        $reveal->execute([
            'game_id' => $gameId,
            'year' => $year,
            'phase' => $phase,
        ]);
        $updated = $reveal->rowCount();

        $nextPosition = $position;
        $ordersDoc = null;
        $resolution = null;
        $nextPhase = $phase;
        $nextYear = $year;
        $closed = false;
        $winnerSummary = null;

        if (diplomacy_phase_mode($phase) === 'orders') {
            $byProvince = diplomacy_collect_orders_by_province($docs);
            $unitOrders = [];
            foreach ((array)$position['units'] as $unit) {
                $raw = $byProvince[$unit['province']] ?? null;
                if ($raw) {
                    diplomacy_canonicalize_order($loaded['graph'], $raw);
                    $unitOrders[] = diplomacy_copy_order($raw, $unit);
                }
            }
            $resolution = diplomacy_adjudicate($loaded['graph'], $position, $unitOrders);
            $nextPosition = diplomacy_apply_movement($position, $resolution);
            $retreats = diplomacy_retreat_choices($loaded['graph'], $nextPosition, $resolution);
            $resolution['retreats'] = $retreats;
            $ordersDoc = diplomacy_combined_orders_document(
                'diplomacy-orders',
                (string)($loaded['graph']['source'] ?? ''),
                $docs
            );
            if ($retreats) {
                $nextPhase = $phase === 'spring_orders' ? 'spring_retreats' : 'fall_retreats';
            } elseif ($phase === 'spring_orders') {
                $nextPhase = 'fall_orders';
            } else {
                $captured = diplomacy_after_fall($loaded['graph'], $nextPosition, $homes, $playerPowers);
                $nextPosition = $captured['position'];
                $resolution['adjustments'] = $captured['adjustments'];
                $winnerSummary = $captured['winner_summary'];
                $closed = $captured['closed'];
                $nextPhase = $closed || !$captured['adjustments'] ? 'spring_orders' : 'builds';
                if ($closed || !$captured['adjustments']) {
                    $nextYear = $year + 1;
                }
            }
        } elseif (diplomacy_phase_mode($phase) === 'retreat') {
            $priorSnap = diplomacy_prior_movement_snapshot($gameId, $year, $phase);
            $prior = is_array($priorSnap) && is_array($priorSnap['resolution'] ?? null)
                ? $priorSnap['resolution']
                : ['units' => $position['units'], 'results' => [], 'attacker_origins' => []];
            $retreats = diplomacy_retreat_choices($loaded['graph'], $position, $prior);
            $nextPosition = diplomacy_apply_retreats($position, $prior, $docs, $retreats);
            $resolution = [
                'text' => diplomacy_retreat_summary_text($loaded['graph'], $position, $prior, $docs, $retreats),
                'notes' => [],
                'units' => $nextPosition['units'],
                'results' => [],
                'retreats' => $retreats,
            ];
            $ordersDoc = diplomacy_combined_orders_document(
                'diplomacy-retreats',
                (string)($loaded['graph']['source'] ?? ''),
                $docs
            );
            if ($phase === 'spring_retreats') {
                $nextPhase = 'fall_orders';
            } else {
                $captured = diplomacy_after_fall($loaded['graph'], $nextPosition, $homes, $playerPowers);
                $nextPosition = $captured['position'];
                $resolution['adjustments'] = $captured['adjustments'];
                $winnerSummary = $captured['winner_summary'];
                $closed = $captured['closed'];
                $nextPhase = $closed || !$captured['adjustments'] ? 'spring_orders' : 'builds';
                if ($closed || !$captured['adjustments']) {
                    $nextYear = $year + 1;
                }
            }
        } else {
            $adjustments = diplomacy_adjustment_choices($loaded['graph'], $position, $homes, $playerPowers);
            $nextPosition = diplomacy_apply_adjustments($loaded['graph'], $position, $docs, $adjustments, $homes, $playerPowers);
            $resolution = [
                'text' => diplomacy_adjust_summary_text($loaded['graph'], $position, $nextPosition),
                'notes' => [],
                'units' => $nextPosition['units'],
                'results' => [],
                'adjustments' => $adjustments,
            ];
            $ordersDoc = diplomacy_combined_orders_document(
                'diplomacy-adjustments',
                (string)($loaded['graph']['source'] ?? ''),
                $docs
            );
            $nextPhase = 'spring_orders';
            $nextYear = $year + 1;
        }

        diplomacy_write_snapshot($gameId, $year, $phase, $position, $ordersDoc, $resolution);

        if ($closed) {
            $pdo->prepare('UPDATE games SET status = :status WHERE id = :id')->execute([
                'status' => 'closed',
                'id' => $gameId,
            ]);
            $pdo->prepare(
                'UPDATE game_state SET phase = :phase, ended_at = ' . db_now_sql() . ', winner_summary = :winner WHERE game_id = :game_id'
            )->execute([
                'phase' => $phase,
                'winner' => $winnerSummary,
                'game_id' => $gameId,
            ]);
            diplomacy_set_phase_deadline($gameId, null);
        } else {
            $pdo->prepare('UPDATE game_state SET phase = :phase, current_round = :year WHERE game_id = :game_id')->execute([
                'phase' => $nextPhase,
                'year' => $nextYear,
                'game_id' => $gameId,
            ]);
            diplomacy_write_snapshot($gameId, $nextYear, $nextPhase, $nextPosition, null, null);
            $minutes = $game['diplomacy_timer_minutes'] ?? null;
            diplomacy_set_phase_deadline($gameId, $minutes === null || $minutes === '' ? null : (int)$minutes);
        }

        if ($startedTx) {
            $pdo->commit();
        }
        return $updated;
    } catch (Throwable $ex) {
        if ($startedTx && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $ex;
    }
}

function diplomacy_after_fall(array &$graph, array $position, array $homes, array $playerPowers): array
{
    $captured = diplomacy_capture_supply_centers($graph, $position);
    $winners = diplomacy_winners($graph, $captured);
    if ($winners) {
        $names = [];
        foreach ($winners as $winner) {
            $power = diplomacy_power_by_id((array)($captured['powers'] ?? []), $winner['power']);
            $names[] = ($power['name'] ?? $winner['power']) . ' (' . $winner['centers'] . ')';
        }
        return [
            'position' => $captured,
            'adjustments' => [],
            'closed' => true,
            'winner_summary' => implode(', ', $names) . ' win with a majority of supply centers.',
        ];
    }
    return [
        'position' => $captured,
        'adjustments' => diplomacy_adjustment_choices($graph, $captured, $homes, $playerPowers),
        'closed' => false,
        'winner_summary' => null,
    ];
}

function diplomacy_retreat_summary_text(array &$graph, array $position, array $prior, array $docs, array $choices): string
{
    unset($position);
    $byOrigin = diplomacy_collect_orders_by_province($docs);
    $lines = [];
    foreach ($choices as $entry) {
        $province = diplomacy_province($graph, $entry['province']);
        $name = $province['name'] ?? $entry['province'];
        $order = $byOrigin[$entry['province']] ?? null;
        if ($order && ($order['action'] ?? '') === 'retreat') {
            $dest = diplomacy_province($graph, $order['to'] ?? '');
            $lines[] = ($entry['power'] ?? '') . ' retreats from ' . $name . ' to ' . ($dest['name'] ?? $order['to']) . '.';
        } else {
            $lines[] = ($entry['power'] ?? '') . ' disbands in ' . $name . '.';
        }
    }
    sort($lines);
    return implode("\n", $lines) . ($lines ? "\n" : '');
}

function diplomacy_adjust_summary_text(array &$graph, array $before, array $after): string
{
    $beforeUnits = [];
    foreach ((array)($before['units'] ?? []) as $unit) {
        $beforeUnits[$unit['province']] = $unit;
    }
    $afterUnits = [];
    foreach ((array)($after['units'] ?? []) as $unit) {
        $afterUnits[$unit['province']] = $unit;
    }
    $lines = [];
    foreach ($afterUnits as $provinceId => $unit) {
        if (!isset($beforeUnits[$provinceId])) {
            $province = diplomacy_province($graph, $provinceId);
            $lines[] = $unit['power'] . ' builds ' . $unit['unit'] . ' in ' . ($province['name'] ?? $provinceId) . '.';
        }
    }
    foreach ($beforeUnits as $provinceId => $unit) {
        if (!isset($afterUnits[$provinceId])) {
            $province = diplomacy_province($graph, $provinceId);
            $lines[] = $unit['power'] . ' disbands in ' . ($province['name'] ?? $provinceId) . '.';
        }
    }
    sort($lines);
    return implode("\n", $lines) . ($lines ? "\n" : '');
}

function diplomacy_apply_due_timer(int $gameId): void
{
    $game = diplomacy_game_row($gameId);
    if ($game === null || (string)$game['status'] !== 'in_progress') {
        return;
    }
    if ((int)($game['diplomacy_timer_shortcut'] ?? 0) !== 1) {
        return;
    }
    $deadline = diplomacy_deadline_timestamp($game['diplomacy_phase_deadline'] ?? null);
    if ($deadline === null || $deadline > time()) {
        return;
    }
    diplomacy_resolve_current_phase($gameId);
}

function diplomacy_game_build_detail_payload(int $gameId, array $game, array $user): array
{
    diplomacy_apply_due_timer($gameId);
    diplomacy_maybe_auto_resolve($gameId);
    $row = diplomacy_game_row($gameId) ?: $game;
    $mapKey = (string)($row['diplomacy_map_key'] ?? diplomacy_default_map_key());
    $entry = diplomacy_map_catalog_entry($mapKey) ?: [
        'key' => $mapKey,
        'powers' => [],
        'svg_url' => '',
        'graph_url' => '',
        'unions_url' => '',
        'start_url' => '',
        'power_count' => 0,
    ];
    $year = (int)($row['current_round'] ?? 1);
    $phase = (string)($row['phase'] ?? default_phase_for_game_type('diplomacy'));
    $status = (string)($row['status'] ?? 'open');
    $members = diplomacy_player_members($gameId);
    $viewerId = (int)($user['id'] ?? 0);
    $memberById = [];
    foreach ($members as $member) {
        $memberById[(int)$member['user_id']] = $member;
    }
    $assignmentMap = diplomacy_assignments_from_row($row);
    $myPower = null;
    $myPowers = [];
    $powers = [];
    $loaded = null;
    $snapshot = null;
    $choices = ['retreats' => [], 'adjustments' => []];
    $position = null;
    $centerCounts = [];
    try {
        $loaded = diplomacy_load_map($mapKey);
        if ($status !== 'open') {
            $snapshot = diplomacy_current_snapshot($gameId, $year, $phase);
            if ($snapshot) {
                $position = $snapshot['position'];
                $choices = diplomacy_current_choices($gameId, $row, $loaded, $snapshot);
                $centerCounts = diplomacy_centers_by_power($loaded['graph'], $position);
            }
        }
        if ($centerCounts === [] && isset($loaded['start']) && is_array($loaded['start'])) {
            $centerCounts = diplomacy_centers_by_power($loaded['graph'], $loaded['start']);
        }
    } catch (Throwable $ex) {
        unset($ex);
        $loaded = null;
    }

    $submittedByPower = [];
    $ordersByUser = [];
    $myOrdersByPower = [];
    $required = [];
    $requiredCount = 0;
    if ($status !== 'open' && $loaded !== null && $snapshot) {
        $required = diplomacy_required_user_ids($gameId, $row, $loaded, $snapshot);
        $requiredCount = count($required);
        foreach (diplomacy_load_phase_actions($gameId, $year, $phase) as $action) {
            $payload = is_array($action['payload']) ? $action['payload'] : [];
            $powerId = (string)($payload['power'] ?? '');
            $actionUserId = (int)$action['user_id'];
            if ($powerId !== '') {
                $submittedByPower[$powerId] = true;
            }
            if (!isset($ordersByUser[$actionUserId])) {
                $ordersByUser[$actionUserId] = [];
            }
            $ordersByUser[$actionUserId][$powerId] = $payload;
            if ($actionUserId === $viewerId && $powerId !== '') {
                $myOrdersByPower[$powerId] = $payload;
            }
        }
    }
    $readyUsers = $status === 'open' ? [] : diplomacy_ready_user_ids($gameId, $year, $phase);

    foreach ((array)$entry['powers'] as $power) {
        $powerId = (string)$power['id'];
        $claimedBy = null;
        $assignedTo = null;
        $assignedUserId = null;
        if (array_key_exists($powerId, $assignmentMap)) {
            $rawAssigned = $assignmentMap[$powerId];
            $assignedUserId = ($rawAssigned === null || $rawAssigned === '') ? null : (int)$rawAssigned;
        } else {
            foreach ($members as $member) {
                if ((string)($member['diplomacy_assigned_power'] ?? '') === $powerId) {
                    $assignedUserId = (int)$member['user_id'];
                    break;
                }
            }
        }
        if ($assignedUserId !== null && isset($memberById[$assignedUserId])) {
            $assignedTo = [
                'user_id' => $assignedUserId,
                'username' => (string)$memberById[$assignedUserId]['username'],
            ];
            if ($assignedUserId === $viewerId) {
                $myPowers[] = $powerId;
            }
        }
        foreach ($members as $member) {
            if (strtolower((string)($member['diplomacy_chosen_power'] ?? '')) === strtolower($powerId)) {
                $claimedBy = [
                    'user_id' => (int)$member['user_id'],
                    'username' => (string)$member['username'],
                ];
            }
        }
        $ownerReady = $assignedUserId !== null && isset($readyUsers[$assignedUserId]);
        $powers[] = [
            'id' => $powerId,
            'name' => $power['name'],
            'color' => $power['color'],
            'chosen_by' => $claimedBy,
            'assigned_to' => $assignedTo,
            'civil_disorder' => $status !== 'open' && $assignedTo === null,
            'center_count' => (int)($centerCounts[$powerId] ?? 0),
            'orders_submitted' => isset($submittedByPower[$powerId]),
            'ready' => $ownerReady,
        ];
    }
    if ($myPowers !== []) {
        $myPower = $myPowers[0];
    }
    foreach ($members as $member) {
        if ((int)$member['user_id'] === $viewerId && strtolower((string)($member['diplomacy_chosen_power'] ?? '')) === 'random') {
            $myPower = $myPower ?: 'random';
        }
    }

    $submittedCount = 0;
    $readyCount = 0;
    if ($required !== []) {
        $neededByUser = [];
        if (diplomacy_phase_mode($phase) === 'orders' && is_array($position)) {
            foreach ((array)($position['units'] ?? []) as $unit) {
                if (!is_array($unit) || empty($unit['power'])) {
                    continue;
                }
                $ownerId = null;
                foreach ($powers as $power) {
                    if ($power['id'] === (string)$unit['power'] && $power['assigned_to']) {
                        $ownerId = (int)$power['assigned_to']['user_id'];
                    }
                }
                if ($ownerId !== null) {
                    $neededByUser[$ownerId][(string)$unit['power']] = true;
                }
            }
        } elseif (diplomacy_phase_mode($phase) === 'retreat') {
            foreach ($choices['retreats'] as $retreat) {
                foreach ($powers as $power) {
                    if ($power['id'] === (string)($retreat['power'] ?? '') && $power['assigned_to']) {
                        $neededByUser[(int)$power['assigned_to']['user_id']][$power['id']] = true;
                    }
                }
            }
        } else {
            foreach ($choices['adjustments'] as $adjustment) {
                foreach ($powers as $power) {
                    if ($power['id'] === (string)($adjustment['power'] ?? '') && $power['assigned_to']) {
                        $neededByUser[(int)$power['assigned_to']['user_id']][$power['id']] = true;
                    }
                }
            }
        }
        foreach ($required as $requiredUserId) {
            $requiredUserId = (int)$requiredUserId;
            $needed = array_keys($neededByUser[$requiredUserId] ?? []);
            $have = $ordersByUser[$requiredUserId] ?? [];
            $complete = $needed !== [];
            foreach ($needed as $neededPower) {
                if (!isset($have[$neededPower])) {
                    $complete = false;
                }
            }
            if ($complete) {
                $submittedCount += 1;
            }
            if (isset($readyUsers[$requiredUserId])) {
                $readyCount += 1;
            }
        }
    }
    $myOrders = ($myPower && $myPower !== 'random' && isset($myOrdersByPower[$myPower])) ? $myOrdersByPower[$myPower] : null;
    $mapEntry = $entry;

    $displayResolution = null;
    if ($snapshot && diplomacy_phase_mode($phase) === 'retreat') {
        $priorSnap = diplomacy_prior_movement_snapshot($gameId, $year, $phase);
        $displayResolution = is_array($priorSnap) ? ($priorSnap['resolution'] ?? null) : null;
    }

    $diplomacy = [
        'map_key' => $mapKey,
        'map' => $mapEntry,
        'maps' => diplomacy_list_maps(),
        'nation_mode' => (string)($row['diplomacy_nation_mode'] ?? 'pick'),
        'year' => $year,
        'phase' => $phase,
        'phase_label' => diplomacy_phase_label($phase, $status === 'open' ? 0 : $year),
        'mode' => diplomacy_phase_mode($phase),
        'my_power' => $myPower && $myPower !== 'random' ? $myPower : ($status === 'open' ? $myPower : null),
        'my_powers' => $myPowers,
        'my_chosen_power' => null,
        'viewer_ready' => isset($readyUsers[$viewerId]),
        'viewer_required' => in_array($viewerId, array_map('intval', $required), true),
        'powers' => $powers,
        'assignments' => $assignmentMap,
        'position' => $position,
        'display_resolution' => $displayResolution,
        'my_orders' => $myOrders,
        'my_orders_by_power' => $myOrdersByPower,
        'retreats' => $status === 'in_progress' ? $choices['retreats'] : [],
        'adjustments' => $status === 'in_progress' ? $choices['adjustments'] : [],
        'history' => $status === 'open' ? [] : diplomacy_history_index($gameId),
        'winner_summary' => $row['winner_summary'] ?? null,
        'timer' => [
            'minutes' => $row['diplomacy_timer_minutes'] === null || $row['diplomacy_timer_minutes'] === ''
                ? null
                : (int)$row['diplomacy_timer_minutes'],
            'shortcut' => (int)($row['diplomacy_timer_shortcut'] ?? 0) === 1,
            'deadline' => diplomacy_deadline_iso($row['diplomacy_phase_deadline'] ?? null),
            'remaining_seconds' => ($deadlineTs = diplomacy_deadline_timestamp($row['diplomacy_phase_deadline'] ?? null)) === null
                ? null
                : max(0, $deadlineTs - time()),
        ],
        'progress' => [
            'year' => $year,
            'phase' => $phase,
            'submitted_count' => $submittedCount,
            'ready_count' => $readyCount,
            'required_count' => $requiredCount,
        ],
    ];
    foreach ($members as $member) {
        if ((int)$member['user_id'] === $viewerId) {
            $diplomacy['my_chosen_power'] = $member['diplomacy_chosen_power'] !== null ? (string)$member['diplomacy_chosen_power'] : null;
        }
    }

    return [
        'diplomacy_order_progress' => [
            'round_number' => $year,
            'submitted_count' => $submittedCount,
            'ready_count' => $readyCount,
            'participant_count' => $requiredCount,
            'phase' => $phase,
        ],
        'diplomacy' => $diplomacy,
    ];
}

function diplomacy_maybe_auto_reveal(int $gameId, int $roundNumber): void
{
    unset($roundNumber);
    diplomacy_maybe_auto_resolve($gameId);
}

function diplomacy_reveal_round_and_advance(int $gameId, int $roundNumber): int
{
    unset($roundNumber);
    return diplomacy_resolve_current_phase($gameId);
}

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
        . 'g.diplomacy_home_centers, gs.phase, gs.current_round, gs.winner_summary '
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

function diplomacy_player_power_map(int $gameId): array
{
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

function diplomacy_update_settings(int $gameId, array $body): void
{
    $mapKey = trim((string)($body['diplomacy_map_key'] ?? diplomacy_default_map_key()));
    $nationMode = trim((string)($body['diplomacy_nation_mode'] ?? 'pick'));
    if ($nationMode !== 'pick' && $nationMode !== 'random') {
        error_response('Invalid diplomacy_nation_mode.', 422);
    }
    if (!diplomacy_map_exists($mapKey)) {
        error_response('Unknown diplomacy map.', 422);
    }

    $stmt = db()->prepare(
        'UPDATE games SET diplomacy_map_key = :map_key, diplomacy_nation_mode = :nation_mode WHERE id = :id'
    );
    $stmt->execute([
        'map_key' => $mapKey,
        'nation_mode' => $nationMode,
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
        error_response('The owner assigned nations at random.', 409);
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
    if (count($players) > (int)$entry['power_count']) {
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

    $assigned = [];
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

    $pdo = db();
    $assignStmt = $pdo->prepare(
        'UPDATE game_members SET diplomacy_assigned_power = :power WHERE game_id = :game_id AND user_id = :user_id'
    );
    $clearStmt = $pdo->prepare(
        'UPDATE game_members SET diplomacy_assigned_power = NULL WHERE game_id = :game_id AND user_id = :user_id'
    );
    foreach ($players as $player) {
        $userId = (int)$player['user_id'];
        $powerId = null;
        foreach ($assigned as $id => $uid) {
            if ($uid === $userId) {
                $powerId = $id;
                break;
            }
        }
        if ($powerId === null) {
            $clearStmt->execute(['game_id' => $gameId, 'user_id' => $userId]);
        } else {
            $assignStmt->execute([
                'power' => $powerId,
                'game_id' => $gameId,
                'user_id' => $userId,
            ]);
        }
    }

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

    $powerMap = diplomacy_player_power_map($gameId);
    $powerId = null;
    foreach ($powerMap as $id => $uid) {
        if ($uid === $userId) {
            $powerId = $id;
            break;
        }
    }
    if ($powerId === null) {
        error_response('You do not have a nation in this game.', 403);
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
    if (($payload['power'] ?? '') !== $powerId) {
        error_response('Orders must be for your assigned power.', 422);
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

    $existing = db()->prepare(
        'SELECT id FROM game_actions '
        . 'WHERE game_id = :game_id AND user_id = :user_id AND round_number = :year AND phase = :phase AND action_type = :action_type '
        . 'LIMIT 1'
    );
    $existing->execute([
        'game_id' => $gameId,
        'user_id' => $userId,
        'year' => $year,
        'phase' => $phase,
        'action_type' => $actionType,
    ]);
    $existingId = $existing->fetchColumn();
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

    diplomacy_maybe_auto_resolve($gameId);
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
    $actions = diplomacy_load_phase_actions($gameId, $year, $phase);
    $submitted = [];
    foreach ($actions as $row) {
        $submitted[$row['user_id']] = true;
    }
    foreach ($required as $userId) {
        if (!isset($submitted[$userId])) {
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
        } else {
            $pdo->prepare('UPDATE game_state SET phase = :phase, current_round = :year WHERE game_id = :game_id')->execute([
                'phase' => $nextPhase,
                'year' => $nextYear,
                'game_id' => $gameId,
            ]);
            diplomacy_write_snapshot($gameId, $nextYear, $nextPhase, $nextPosition, null, null);
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

function diplomacy_game_build_detail_payload(int $gameId, array $game, array $user): array
{
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
    $myPower = null;
    $powers = [];
    foreach ((array)$entry['powers'] as $power) {
        $claimedBy = null;
        $assignedTo = null;
        foreach ($members as $member) {
            if (strtolower((string)($member['diplomacy_chosen_power'] ?? '')) === strtolower((string)$power['id'])) {
                $claimedBy = [
                    'user_id' => (int)$member['user_id'],
                    'username' => (string)$member['username'],
                ];
            }
            if ((string)($member['diplomacy_assigned_power'] ?? '') === (string)$power['id']) {
                $assignedTo = [
                    'user_id' => (int)$member['user_id'],
                    'username' => (string)$member['username'],
                ];
                if ((int)$member['user_id'] === $viewerId) {
                    $myPower = (string)$power['id'];
                }
            }
        }
        $powers[] = [
            'id' => $power['id'],
            'name' => $power['name'],
            'color' => $power['color'],
            'chosen_by' => $claimedBy,
            'assigned_to' => $assignedTo,
            'civil_disorder' => $status !== 'open' && $assignedTo === null,
        ];
    }
    foreach ($members as $member) {
        if ((int)$member['user_id'] === $viewerId && strtolower((string)($member['diplomacy_chosen_power'] ?? '')) === 'random') {
            $myPower = $myPower ?: 'random';
        }
    }

    $loaded = null;
    $snapshot = null;
    $choices = ['retreats' => [], 'adjustments' => []];
    $position = null;
    $myOrders = null;
    $submittedCount = 0;
    $requiredCount = 0;
    if ($status !== 'open') {
        try {
            $loaded = diplomacy_load_map($mapKey);
            $snapshot = diplomacy_current_snapshot($gameId, $year, $phase);
            if ($snapshot) {
                $position = $snapshot['position'];
                $choices = diplomacy_current_choices($gameId, $row, $loaded, $snapshot);
                $required = diplomacy_required_user_ids($gameId, $row, $loaded, $snapshot);
                $requiredCount = count($required);
                $actions = diplomacy_load_phase_actions($gameId, $year, $phase);
                foreach ($actions as $action) {
                    $submittedCount += 1;
                    if ($action['user_id'] === $viewerId) {
                        $myOrders = $action['payload'];
                    }
                }
            }
        } catch (Throwable $ex) {
            unset($ex);
        }
    }

    $viewerRetreats = [];
    foreach ($choices['retreats'] as $entry) {
        if ($myPower && ($entry['power'] ?? null) === $myPower) {
            $viewerRetreats[] = $entry;
        } elseif ($myPower === null) {
            $viewerRetreats[] = $entry;
        }
    }
    $viewerAdjustments = [];
    foreach ($choices['adjustments'] as $entry) {
        if ($myPower && ($entry['power'] ?? null) === $myPower) {
            $viewerAdjustments[] = $entry;
        } elseif ($myPower === null) {
            $viewerAdjustments[] = $entry;
        }
    }

    $displayResolution = null;
    if ($snapshot && diplomacy_phase_mode($phase) === 'retreat') {
        $priorSnap = diplomacy_prior_movement_snapshot($gameId, $year, $phase);
        $displayResolution = is_array($priorSnap) ? ($priorSnap['resolution'] ?? null) : null;
    }

    $diplomacy = [
        'map_key' => $mapKey,
        'map' => $entry,
        'maps' => diplomacy_list_maps(),
        'nation_mode' => (string)($row['diplomacy_nation_mode'] ?? 'pick'),
        'year' => $year,
        'phase' => $phase,
        'phase_label' => diplomacy_phase_label($phase, $status === 'open' ? 0 : $year),
        'mode' => diplomacy_phase_mode($phase),
        'my_power' => $myPower && $myPower !== 'random' ? $myPower : ($status === 'open' ? $myPower : null),
        'my_chosen_power' => null,
        'powers' => $powers,
        'position' => $position,
        'display_resolution' => $displayResolution,
        'my_orders' => $myOrders,
        'retreats' => $status === 'in_progress' ? $choices['retreats'] : [],
        'adjustments' => $status === 'in_progress' ? $choices['adjustments'] : [],
        'history' => $status === 'open' ? [] : diplomacy_history_index($gameId),
        'winner_summary' => $row['winner_summary'] ?? null,
        'progress' => [
            'year' => $year,
            'phase' => $phase,
            'submitted_count' => $submittedCount,
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

<?php

declare(strict_types=1);

require_once __DIR__ . '/adjudicate.php';

function diplomacy_phases(): array
{
    return ['setup', 'spring_orders', 'spring_retreats', 'fall_orders', 'fall_retreats', 'builds'];
}

function diplomacy_phase_mode(string $phase): string
{
    if ($phase === 'spring_retreats' || $phase === 'fall_retreats') {
        return 'retreat';
    }
    if ($phase === 'builds') {
        return 'build';
    }
    return 'orders';
}

function diplomacy_phase_action_type(string $phase): string
{
    $mode = diplomacy_phase_mode($phase);
    if ($mode === 'retreat') {
        return 'retreat';
    }
    if ($mode === 'build') {
        return 'adjust';
    }
    return 'order';
}

function diplomacy_phase_label(string $phase, int $year = 0): string
{
    $labels = [
        'setup' => 'Setup',
        'spring_orders' => 'Spring orders',
        'spring_retreats' => 'Spring retreats',
        'fall_orders' => 'Fall orders',
        'fall_retreats' => 'Fall retreats',
        'builds' => 'Builds',
    ];
    $label = $labels[$phase] ?? $phase;
    return $year > 0 && $phase !== 'setup' ? $year . ' ' . $label : $label;
}

function diplomacy_collect_orders_by_province(array $documents): array
{
    $byProvince = [];
    foreach ($documents as $doc) {
        if (!is_array($doc) || !isset($doc['orders']) || !is_array($doc['orders'])) {
            continue;
        }
        foreach ($doc['orders'] as $order) {
            if (!is_array($order) || empty($order['province'])) {
                continue;
            }
            $byProvince[$order['province']] = $order;
        }
    }
    return $byProvince;
}

function diplomacy_apply_movement(array $position, array $resolution): array
{
    $next = diplomacy_clone($position);
    $next['units'] = [];
    foreach ((array)($resolution['units'] ?? []) as $unit) {
        if (!is_array($unit) || empty($unit['province'])) {
            continue;
        }
        $next['units'][] = [
            'province' => $unit['province'],
            'unit' => $unit['unit'],
            'power' => $unit['power'],
        ];
    }
    return $next;
}

function diplomacy_retreat_choices(array &$graph, array $position, array $resolution): array
{
    $occupied = [];
    foreach ((array)($resolution['units'] ?? []) as $unit) {
        if (!is_array($unit) || !empty($unit['dislodged'])) {
            continue;
        }
        $occupied[$unit['province']] = true;
    }
    $contested = [];
    foreach ((array)($resolution['results'] ?? []) as $provinceId => $result) {
        if (!is_array($result) || ($result['action'] ?? '') !== 'move') {
            continue;
        }
        if (!empty($result['moved']) || empty($result['pathOk']) || empty($result['to'])) {
            continue;
        }
        $contested[$result['to']] = true;
    }
    $attackerOrigins = (array)($resolution['attacker_origins'] ?? []);
    $choices = [];
    foreach ((array)($resolution['units'] ?? []) as $unit) {
        if (!is_array($unit) || empty($unit['dislodged'])) {
            continue;
        }
        $origin = $unit['origin'] ?? $unit['province'];
        $legal = [];
        foreach (diplomacy_legal_destinations($graph, $origin, (string)$unit['unit']) as $dest) {
            if (isset($occupied[$dest]) || isset($contested[$dest])) {
                continue;
            }
            if (($attackerOrigins[$origin] ?? null) === $dest) {
                continue;
            }
            $legal[] = $dest;
        }
        sort($legal);
        $choices[] = [
            'province' => $origin,
            'unit' => $unit['unit'],
            'power' => $unit['power'],
            'choices' => $legal,
            'disband' => true,
        ];
    }
    return $choices;
}

function diplomacy_apply_retreats(array $position, array $resolution, array $retreatDocs, array $retreatChoices): array
{
    $next = diplomacy_clone($position);
    $byOrigin = [];
    foreach (diplomacy_collect_orders_by_province($retreatDocs) as $provinceId => $order) {
        $byOrigin[$provinceId] = $order;
    }
    $choiceByOrigin = [];
    foreach ($retreatChoices as $entry) {
        $choiceByOrigin[$entry['province']] = $entry;
    }

    $claimed = [];
    $planned = [];
    foreach ((array)($resolution['units'] ?? []) as $unit) {
        if (!is_array($unit) || empty($unit['dislodged'])) {
            continue;
        }
        $origin = $unit['origin'] ?? $unit['province'];
        $entry = $choiceByOrigin[$origin] ?? null;
        $order = $byOrigin[$origin] ?? null;
        $dest = null;
        if ($order && ($order['action'] ?? '') === 'retreat' && $entry) {
            $want = $order['to'] ?? null;
            if ($want && in_array($want, (array)($entry['choices'] ?? []), true)) {
                $dest = $want;
            }
        }
        $planned[] = [
            'unit' => $unit,
            'origin' => $origin,
            'to' => $dest,
        ];
        if ($dest !== null) {
            $claimed[$dest] = ($claimed[$dest] ?? 0) + 1;
        }
    }

    $kept = [];
    foreach ((array)($resolution['units'] ?? []) as $unit) {
        if (!is_array($unit) || !empty($unit['dislodged'])) {
            continue;
        }
        $kept[$unit['province']] = [
            'province' => $unit['province'],
            'unit' => $unit['unit'],
            'power' => $unit['power'],
        ];
    }
    foreach ($planned as $item) {
        $dest = $item['to'];
        if ($dest === null || ($claimed[$dest] ?? 0) !== 1) {
            continue;
        }
        $unit = $item['unit'];
        $kept[$dest] = [
            'province' => $dest,
            'unit' => $unit['unit'],
            'power' => $unit['power'],
        ];
    }
    $next['units'] = array_values($kept);
    return $next;
}

function diplomacy_capture_supply_centers(array &$graph, array $position): array
{
    $next = diplomacy_clone($position);
    foreach ($next['units'] as $unit) {
        $province = diplomacy_province($graph, $unit['province'] ?? '');
        if (!$province || empty($province['supplyCenter'])) {
            continue;
        }
        $next['ownership'][$unit['province']] = $unit['power'];
    }
    return $next;
}

function diplomacy_centers_by_power(array &$graph, array $position): array
{
    $counts = [];
    foreach ((array)($position['powers'] ?? []) as $power) {
        if (is_array($power) && isset($power['id'])) {
            $counts[$power['id']] = 0;
        }
    }
    foreach ((array)($position['ownership'] ?? []) as $provinceId => $powerId) {
        $province = diplomacy_province($graph, $provinceId);
        if (!$province || empty($province['supplyCenter'])) {
            continue;
        }
        $counts[(string)$powerId] = ($counts[(string)$powerId] ?? 0) + 1;
    }
    return $counts;
}

function diplomacy_units_by_power(array $position): array
{
    $counts = [];
    foreach ((array)($position['units'] ?? []) as $unit) {
        if (!is_array($unit) || empty($unit['power'])) {
            continue;
        }
        $counts[$unit['power']] = ($counts[$unit['power']] ?? 0) + 1;
    }
    return $counts;
}

function diplomacy_victory_center_count(array &$graph): int
{
    $total = count(diplomacy_supply_center_ids($graph));
    if ($total < 18) {
        return (int)floor($total / 2) + 1;
    }
    return 18;
}

function diplomacy_winners(array &$graph, array $position): array
{
    $needed = diplomacy_victory_center_count($graph);
    $winners = [];
    foreach (diplomacy_centers_by_power($graph, $position) as $powerId => $count) {
        if ($count >= $needed) {
            $winners[] = ['power' => $powerId, 'centers' => $count];
        }
    }
    usort($winners, static fn (array $a, array $b): int => $b['centers'] <=> $a['centers']);
    return $winners;
}

function diplomacy_adjustment_choices(array &$graph, array $position, array $homes, array $playerPowers): array
{
    $centers = diplomacy_centers_by_power($graph, $position);
    $units = diplomacy_units_by_power($position);
    $occupied = [];
    foreach ((array)($position['units'] ?? []) as $unit) {
        $occupied[$unit['province']] = true;
    }
    $adjustments = [];
    foreach ((array)($position['powers'] ?? []) as $power) {
        if (!is_array($power) || empty($power['id'])) {
            continue;
        }
        $powerId = (string)$power['id'];
        $count = (int)($centers[$powerId] ?? 0) - (int)($units[$powerId] ?? 0);
        $hasPlayer = isset($playerPowers[$powerId]);
        $builds = [];
        $disbands = [];
        if ($count > 0 && $hasPlayer) {
            foreach ((array)($homes[$powerId] ?? []) as $homeId) {
                $province = diplomacy_province($graph, $homeId);
                if (!$province || empty($province['supplyCenter'])) {
                    continue;
                }
                if (($position['ownership'][$homeId] ?? null) !== $powerId) {
                    continue;
                }
                if (isset($occupied[$homeId])) {
                    continue;
                }
                if (diplomacy_can_place($graph, $homeId, 'army')) {
                    $builds[] = ['province' => $homeId, 'unit' => 'army'];
                }
                if (diplomacy_can_place($graph, $homeId, 'fleet')) {
                    $builds[] = ['province' => $homeId, 'unit' => 'fleet'];
                }
            }
            if ($builds === []) {
                $count = 0;
            }
        } elseif ($count < 0) {
            foreach ((array)($position['units'] ?? []) as $unit) {
                if (($unit['power'] ?? null) === $powerId) {
                    $disbands[] = $unit['province'];
                }
            }
            sort($disbands);
        } else {
            $count = 0;
        }
        if ($count === 0) {
            continue;
        }
        $adjustments[] = [
            'power' => $powerId,
            'count' => $count,
            'builds' => $builds,
            'disbands' => $disbands,
        ];
    }
    return $adjustments;
}

function diplomacy_apply_adjustments(
    array &$graph,
    array $position,
    array $adjustDocs,
    array $adjustments,
    array $homes,
    array $playerPowers
): array {
    $next = diplomacy_clone($position);
    $byPower = [];
    foreach ($adjustments as $entry) {
        $byPower[$entry['power']] = $entry;
    }
    $ordersByPower = [];
    foreach ($adjustDocs as $doc) {
        if (!is_array($doc) || empty($doc['power'])) {
            continue;
        }
        $ordersByPower[$doc['power']] = (array)($doc['orders'] ?? []);
    }

    $units = (array)$next['units'];
    foreach ($byPower as $powerId => $entry) {
        $count = (int)$entry['count'];
        $submitted = $ordersByPower[$powerId] ?? [];
        $hasPlayer = isset($playerPowers[$powerId]);
        if ($count > 0) {
            if (!$hasPlayer) {
                continue;
            }
            $built = 0;
            $used = [];
            foreach ($submitted as $order) {
                if (!is_array($order) || ($order['action'] ?? '') !== 'build' || $built >= $count) {
                    continue;
                }
                $provinceId = $order['province'] ?? '';
                $unitType = $order['unit'] ?? '';
                $allowed = false;
                foreach ((array)$entry['builds'] as $offer) {
                    if ($offer['province'] === $provinceId && $offer['unit'] === $unitType) {
                        $allowed = true;
                        break;
                    }
                }
                if (!$allowed || isset($used[$provinceId])) {
                    continue;
                }
                $used[$provinceId] = true;
                $units[] = [
                    'province' => $provinceId,
                    'unit' => $unitType,
                    'power' => $powerId,
                ];
                $built += 1;
            }
            continue;
        }

        if ($count >= 0) {
            continue;
        }
        $needed = -$count;
        $removed = [];
        if ($hasPlayer) {
            foreach ($submitted as $order) {
                if (!is_array($order) || ($order['action'] ?? '') !== 'disband' || count($removed) >= $needed) {
                    continue;
                }
                $provinceId = $order['province'] ?? '';
                if (!in_array($provinceId, (array)$entry['disbands'], true) || isset($removed[$provinceId])) {
                    continue;
                }
                $removed[$provinceId] = true;
            }
        }
        if (count($removed) < $needed) {
            $candidates = [];
            foreach ($units as $unit) {
                if (($unit['power'] ?? null) !== $powerId || isset($removed[$unit['province']])) {
                    continue;
                }
                $distance = diplomacy_shortest_distance($graph, $unit['province'], (array)($homes[$powerId] ?? []));
                $candidates[] = [
                    'province' => $unit['province'],
                    'distance' => $distance,
                ];
            }
            usort($candidates, static function (array $a, array $b): int {
                if ($a['distance'] !== $b['distance']) {
                    return $b['distance'] <=> $a['distance'];
                }
                return strcmp((string)$a['province'], (string)$b['province']);
            });
            foreach ($candidates as $candidate) {
                if (count($removed) >= $needed) {
                    break;
                }
                $removed[$candidate['province']] = true;
            }
        }
        $units = array_values(array_filter($units, static function (array $unit) use ($removed): bool {
            return !isset($removed[$unit['province']]);
        }));
    }
    $next['units'] = $units;
    return $next;
}

function diplomacy_combined_orders_document(string $kind, string $map, array $documents): array
{
    $orders = [];
    foreach ($documents as $doc) {
        foreach ((array)($doc['orders'] ?? []) as $order) {
            if (is_array($order)) {
                $orders[] = $order;
            }
        }
    }
    return [
        'kind' => $kind,
        'map' => $map,
        'power' => '',
        'orders' => $orders,
    ];
}

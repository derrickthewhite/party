<?php

declare(strict_types=1);

function diplomacy_maps_root(): string
{
    return dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'diplomacy' . DIRECTORY_SEPARATOR . 'maps';
}

function diplomacy_default_map_key(): string
{
    return 'EuropeDiploMap';
}

function diplomacy_map_dir(string $mapKey): string
{
    return diplomacy_maps_root() . DIRECTORY_SEPARATOR . $mapKey;
}

function diplomacy_list_maps(): array
{
    $root = diplomacy_maps_root();
    if (!is_dir($root)) {
        return [];
    }

    $maps = [];
    $entries = scandir($root) ?: [];
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $map = diplomacy_map_catalog_entry($entry);
        if ($map !== null) {
            $maps[] = $map;
        }
    }

    usort($maps, static fn (array $a, array $b): int => strcmp((string)$a['key'], (string)$b['key']));
    return $maps;
}

function diplomacy_map_catalog_entry(string $mapKey): ?array
{
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $mapKey)) {
        return null;
    }

    $dir = diplomacy_map_dir($mapKey);
    $startPath = $dir . DIRECTORY_SEPARATOR . $mapKey . '.start.json';
    if (!is_file($startPath)) {
        return null;
    }

    $start = diplomacy_read_json_file($startPath);
    $powers = [];
    foreach ((array)($start['powers'] ?? []) as $power) {
        if (!is_array($power) || !isset($power['id'])) {
            continue;
        }
        $powers[] = [
            'id' => (string)$power['id'],
            'name' => (string)($power['name'] ?? $power['id']),
            'color' => (string)($power['color'] ?? '#888888'),
        ];
    }

    return [
        'key' => $mapKey,
        'label' => $mapKey,
        'svg_url' => 'diplomacy/maps/' . $mapKey . '/' . $mapKey . '.svg',
        'graph_url' => 'diplomacy/maps/' . $mapKey . '/' . $mapKey . '.graph.json',
        'unions_url' => 'diplomacy/maps/' . $mapKey . '/' . $mapKey . '.unions.json',
        'start_url' => 'diplomacy/maps/' . $mapKey . '/' . $mapKey . '.start.json',
        'powers' => $powers,
        'power_count' => count($powers),
    ];
}

function diplomacy_map_exists(string $mapKey): bool
{
    return diplomacy_map_catalog_entry($mapKey) !== null;
}

function diplomacy_read_json_file(string $path): array
{
    $raw = @file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('Unable to read ' . $path);
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON in ' . $path);
    }
    return $decoded;
}

function diplomacy_load_map(string $mapKey): array
{
    $entry = diplomacy_map_catalog_entry($mapKey);
    if ($entry === null) {
        throw new RuntimeException('Unknown diplomacy map: ' . $mapKey);
    }

    $dir = diplomacy_map_dir($mapKey);
    $graph = diplomacy_read_json_file($dir . DIRECTORY_SEPARATOR . $mapKey . '.graph.json');
    $unionsPath = $dir . DIRECTORY_SEPARATOR . $mapKey . '.unions.json';
    $graph['unions'] = is_file($unionsPath) ? diplomacy_read_json_file($unionsPath) : [];
    diplomacy_unite_provinces($graph);

    $start = diplomacy_read_json_file($dir . DIRECTORY_SEPARATOR . $mapKey . '.start.json');
    diplomacy_canonicalize_position($graph, $start);

    return [
        'key' => $mapKey,
        'entry' => $entry,
        'graph' => $graph,
        'start' => $start,
    ];
}

function diplomacy_clone($value)
{
    return json_decode(json_encode($value, JSON_UNESCAPED_UNICODE), true);
}

function diplomacy_json_decode_column($raw): ?array
{
    if ($raw === null || $raw === '') {
        return null;
    }
    if (is_array($raw)) {
        return $raw;
    }
    $decoded = json_decode((string)$raw, true);
    return is_array($decoded) ? $decoded : null;
}

function diplomacy_province(array &$graph, $id): ?array
{
    if ($id === null || $id === '') {
        return null;
    }
    diplomacy_unite_provinces($graph);
    $canonical = $graph['aliases'][$id] ?? $id;
    $province = $graph['provinces'][$canonical] ?? null;
    return is_array($province) ? $province : null;
}

function diplomacy_province_id(array &$graph, $id)
{
    if ($id === null || $id === '') {
        return $id;
    }
    diplomacy_unite_provinces($graph);
    return $graph['aliases'][$id] ?? $id;
}

function diplomacy_is_open(?array $province): bool
{
    return $province !== null && (!isset($province['access']) || $province['access'] === 'open' || $province['access'] === '');
}

function diplomacy_unite_unique(array $list, callable $canon, $block): array
{
    $seen = [];
    $out = [];
    foreach ($list as $item) {
        $id = $canon($item);
        if (!$id || $id === $block || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;
        $out[] = $id;
    }
    return $out;
}

function diplomacy_unite_provinces(array &$graph): array
{
    if (!empty($graph['united'])) {
        return $graph;
    }
    $graph['united'] = true;
    $unions = $graph['unions'] ?? [];
    if (!is_array($unions) || $unions === []) {
        $graph['aliases'] = [];
        return $graph;
    }

    $canonOf = [];
    foreach ($unions as $union) {
        foreach ((array)($union['parts'] ?? []) as $part) {
            $canonOf[$part] = $union['id'];
        }
    }
    $canon = static fn ($id) => $canonOf[$id] ?? $id;

    $aliases = [];
    foreach ($unions as $group) {
        $mainId = (string)($group['id'] ?? '');
        if ($mainId === '' || !isset($graph['provinces'][$mainId]) || !is_array($graph['provinces'][$mainId])) {
            continue;
        }
        $main = &$graph['provinces'][$mainId];
        $neighbors = [];
        $army = [];
        $fleet = [];
        $seaTouch = [];
        $waterParts = [];
        $coastal = !empty($main['coastal']);
        $groupParts = (array)($group['parts'] ?? []);
        foreach ($groupParts as $partId) {
            if ($partId !== $mainId) {
                $aliases[$partId] = $mainId;
            }
            $src = $graph['provinces'][$partId] ?? null;
            if (!is_array($src)) {
                continue;
            }
            if (($src['kind'] ?? '') === 'sea' || !empty($src['coastal'])) {
                $coastal = true;
            }
            if (($src['access'] ?? '') === 'neutral-water') {
                $waterParts[] = $partId;
            }
            $neighbors = array_merge($neighbors, (array)($src['neighbors'] ?? []));
            if (($src['kind'] ?? '') === 'sea') {
                $seaTouch = array_merge($seaTouch, (array)($src['neighbors'] ?? []));
            } else {
                $army = array_merge($army, (array)($src['army'] ?? []));
                $fleet = array_merge($fleet, (array)($src['fleet'] ?? []));
            }
        }
        if (!empty($group['name'])) {
            $main['name'] = $group['name'];
        }
        $main['parts'] = $groupParts;
        if ($waterParts) {
            $main['waterParts'] = $waterParts;
        }
        $main['neighbors'] = diplomacy_unite_unique($neighbors, $canon, $mainId);
        $main['army'] = diplomacy_unite_unique($army, $canon, $mainId);
        $main['fleet'] = diplomacy_unite_unique($fleet, $canon, $mainId);
        $main['coastal'] = $coastal;
        $coasts = diplomacy_unite_unique($seaTouch, $canon, $mainId);
        foreach ($coasts as $coastId) {
            $other = &$graph['provinces'][$coastId];
            if (!is_array($other) || (isset($other['access']) && $other['access'] !== '' && $other['access'] !== 'open')) {
                unset($other);
                continue;
            }
            if (!isset($main['fleet']) || !is_array($main['fleet'])) {
                $main['fleet'] = [];
            }
            if (!in_array($coastId, $main['fleet'], true)) {
                $main['fleet'][] = $coastId;
            }
            if (!isset($other['fleet']) || !is_array($other['fleet'])) {
                $other['fleet'] = [];
            }
            if (!in_array($mainId, $other['fleet'], true)) {
                $other['fleet'][] = $mainId;
            }
            unset($other);
        }
        foreach ($groupParts as $partId) {
            if ($partId !== $mainId) {
                unset($graph['provinces'][$partId]);
            }
        }
        unset($main);
    }

    foreach ($graph['provinces'] as $id => &$province) {
        $province['neighbors'] = diplomacy_unite_unique((array)($province['neighbors'] ?? []), $canon, $id);
        $province['army'] = diplomacy_unite_unique((array)($province['army'] ?? []), $canon, $id);
        $province['fleet'] = diplomacy_unite_unique((array)($province['fleet'] ?? []), $canon, $id);
    }
    unset($province);
    $graph['aliases'] = $aliases;
    return $graph;
}

function diplomacy_canonicalize_position(array &$graph, array &$position): array
{
    diplomacy_unite_provinces($graph);
    if (!isset($position['ownership']) || !is_array($position['ownership'])) {
        $position['ownership'] = [];
    }
    $ownership = [];
    foreach ($position['ownership'] as $provinceId => $powerId) {
        $ownership[diplomacy_province_id($graph, $provinceId)] = $powerId;
    }
    $position['ownership'] = $ownership;
    if (!isset($position['units']) || !is_array($position['units'])) {
        $position['units'] = [];
    }
    foreach ($position['units'] as &$unit) {
        if (isset($unit['province'])) {
            $unit['province'] = diplomacy_province_id($graph, $unit['province']);
        }
    }
    unset($unit);
    return $position;
}

function diplomacy_canonicalize_order(array &$graph, array &$order): array
{
    diplomacy_unite_provinces($graph);
    foreach (['province', 'to', 'target', 'from'] as $field) {
        if (isset($order[$field])) {
            $order[$field] = diplomacy_province_id($graph, $order[$field]);
        }
    }
    if (isset($order['via']) && is_array($order['via'])) {
        $order['via'] = array_map(static fn ($id) => diplomacy_province_id($graph, $id), $order['via']);
    }
    return $order;
}

function diplomacy_legal_destinations(array &$graph, $provinceId, string $unitType): array
{
    $province = diplomacy_province($graph, $provinceId);
    if ($province === null) {
        return [];
    }
    if ($unitType === 'fleet') {
        return array_values((array)($province['fleet'] ?? []));
    }
    if ($unitType === 'army') {
        return array_values((array)($province['army'] ?? []));
    }
    return [];
}

function diplomacy_is_legal_move(array &$graph, $from, string $unitType, $to): bool
{
    return in_array(diplomacy_province_id($graph, $to), diplomacy_legal_destinations($graph, $from, $unitType), true);
}

function diplomacy_can_place(array &$graph, $provinceId, string $unitType): bool
{
    $province = diplomacy_province($graph, $provinceId);
    if ($province === null || !diplomacy_is_open($province)) {
        return false;
    }
    if ($unitType === 'army') {
        return ($province['kind'] ?? '') !== 'sea';
    }
    if ($unitType === 'fleet') {
        return ($province['kind'] ?? '') === 'sea' || !empty($province['coastal']);
    }
    return false;
}

function diplomacy_seas_beside(array &$graph, $provinceId): array
{
    $ids = [];
    foreach (diplomacy_legal_destinations($graph, $provinceId, 'fleet') as $destId) {
        $sea = diplomacy_province($graph, $destId);
        if ($sea && ($sea['kind'] ?? '') === 'sea') {
            $ids[] = $destId;
        }
    }
    return $ids;
}

function diplomacy_unit_at(array $units, $provinceId): ?array
{
    foreach ($units as $unit) {
        if (is_array($unit) && ($unit['province'] ?? null) === $provinceId) {
            return $unit;
        }
    }
    return null;
}

function diplomacy_fleet_on_sea(array $position, $seaId): ?array
{
    $unit = diplomacy_unit_at((array)($position['units'] ?? []), $seaId);
    return $unit && ($unit['unit'] ?? '') === 'fleet' ? $unit : null;
}

function diplomacy_can_reach(array &$graph, array $position, array $unit, $destId): bool
{
    if ($destId === null || $destId === '') {
        return false;
    }
    $destId = diplomacy_province_id($graph, $destId);
    if (diplomacy_is_legal_move($graph, $unit['province'] ?? '', (string)($unit['unit'] ?? ''), $destId)) {
        return true;
    }
    if (($unit['unit'] ?? '') !== 'army') {
        return false;
    }
    $dest = diplomacy_province($graph, $destId);
    $origin = diplomacy_province($graph, $unit['province'] ?? '');
    if (!$dest || ($dest['kind'] ?? '') === 'sea' || empty($dest['coastal']) || !$origin || empty($origin['coastal'])) {
        return false;
    }
    $seen = [];
    $queue = diplomacy_seas_beside($graph, $unit['province']);
    while ($queue) {
        $seaId = array_shift($queue);
        if (isset($seen[$seaId])) {
            continue;
        }
        $seen[$seaId] = true;
        if (!diplomacy_fleet_on_sea($position, $seaId)) {
            continue;
        }
        if (diplomacy_is_legal_move($graph, $seaId, 'fleet', $destId)) {
            return true;
        }
        foreach (diplomacy_legal_destinations($graph, $seaId, 'fleet') as $next) {
            $hop = diplomacy_province($graph, $next);
            if ($hop && ($hop['kind'] ?? '') === 'sea' && !isset($seen[$next])) {
                $queue[] = $next;
            }
        }
    }
    return false;
}

function diplomacy_is_legal_army_convoy(array &$graph, array $position, $from, array $via, $to): bool
{
    $start = diplomacy_province($graph, $from);
    $land = diplomacy_province($graph, $to);
    if (!$start || empty($start['coastal']) || !$land || ($land['kind'] ?? '') === 'sea' || $from === $to) {
        return false;
    }
    if ($via === []) {
        return false;
    }
    if (!diplomacy_is_legal_move($graph, $from, 'fleet', $via[0])) {
        return false;
    }
    foreach ($via as $i => $seaId) {
        $sea = diplomacy_province($graph, $seaId);
        if (!$sea || ($sea['kind'] ?? '') !== 'sea' || !diplomacy_fleet_on_sea($position, $seaId)) {
            return false;
        }
        if ($i > 0 && !diplomacy_is_legal_move($graph, $via[$i - 1], 'fleet', $seaId)) {
            return false;
        }
    }
    return diplomacy_is_legal_move($graph, $via[count($via) - 1], 'fleet', $to);
}

function diplomacy_shared_convoy_sea(array &$graph, $fromId, $toId): ?string
{
    foreach (diplomacy_seas_beside($graph, $fromId) as $seaId) {
        if (diplomacy_is_legal_move($graph, $seaId, 'fleet', $toId)) {
            return (string)$seaId;
        }
    }
    return null;
}

function diplomacy_power_by_id(array $powers, $id): ?array
{
    foreach ($powers as $power) {
        if (is_array($power) && ($power['id'] ?? null) === $id) {
            return $power;
        }
    }
    return null;
}

function diplomacy_normalize_action($action): string
{
    if ($action === 'attack') {
        return 'move';
    }
    if ($action === 'support-attack') {
        return 'support-move';
    }
    return (string)$action;
}

function diplomacy_copy_order(array $raw, array $standing): array
{
    $action = diplomacy_normalize_action($raw['action'] ?? '');
    $order = [
        'province' => $standing['province'],
        'unit' => $standing['unit'],
        'power' => $standing['power'],
        'action' => $action,
    ];
    if ($action === 'move') {
        $order['to'] = $raw['to'] ?? null;
    }
    if ($action === 'support-defense') {
        $order['target'] = $raw['target'] ?? null;
    }
    if ($action === 'support-move') {
        $order['target'] = $raw['target'] ?? null;
        $order['to'] = $raw['to'] ?? null;
    }
    if ($action === 'convoy') {
        $order['from'] = $raw['from'] ?? (($standing['unit'] ?? '') === 'army' ? $standing['province'] : ($raw['from'] ?? null));
        $order['to'] = $raw['to'] ?? null;
        if (isset($raw['via']) && is_array($raw['via']) && $raw['via']) {
            $order['via'] = array_values($raw['via']);
        }
    }
    return $order;
}

function diplomacy_is_legal_order(array &$graph, array $position, array $order): bool
{
    $standing = diplomacy_unit_at((array)($position['units'] ?? []), $order['province'] ?? null);
    if ($standing === null) {
        return false;
    }
    if (!empty($order['unit']) && $order['unit'] !== $standing['unit']) {
        return false;
    }
    $action = diplomacy_normalize_action($order['action'] ?? '');
    if ($action === 'hold') {
        return true;
    }
    if ($action === 'move') {
        return diplomacy_is_legal_move($graph, $order['province'], (string)$standing['unit'], $order['to'] ?? null);
    }
    if ($action === 'support-defense') {
        return !empty($order['target'])
            && $order['target'] !== $order['province']
            && diplomacy_unit_at((array)($position['units'] ?? []), $order['target']) !== null
            && diplomacy_is_legal_move($graph, $order['province'], (string)$standing['unit'], $order['target']);
    }
    if ($action === 'support-move') {
        $ally = diplomacy_unit_at((array)($position['units'] ?? []), $order['target'] ?? null);
        return $ally !== null
            && ($order['target'] ?? null) !== $order['province']
            && !empty($order['to'])
            && $order['to'] !== $order['province']
            && diplomacy_is_legal_move($graph, $order['province'], (string)$standing['unit'], $order['to'])
            && diplomacy_can_reach($graph, $position, $ally, $order['to']);
    }
    if ($action === 'convoy') {
        $here = diplomacy_province($graph, $order['province']);
        if (($standing['unit'] ?? '') === 'army') {
            $via = isset($order['via']) && is_array($order['via']) ? $order['via'] : [];
            if ($via === []) {
                $sea = diplomacy_shared_convoy_sea($graph, $order['province'], $order['to'] ?? null);
                if ($sea) {
                    $via = [$sea];
                }
            }
            return diplomacy_is_legal_army_convoy($graph, $position, $order['province'], $via, $order['to'] ?? null);
        }
        $army = diplomacy_unit_at((array)($position['units'] ?? []), $order['from'] ?? null);
        $dest = diplomacy_province($graph, $order['to'] ?? null);
        return ($standing['unit'] ?? '') === 'fleet'
            && $here
            && ($here['kind'] ?? '') === 'sea'
            && $army
            && ($army['unit'] ?? '') === 'army'
            && $dest
            && ($dest['kind'] ?? '') !== 'sea'
            && !empty($dest['coastal'])
            && ($order['from'] ?? null) !== ($order['to'] ?? null);
    }
    return false;
}

function diplomacy_supply_center_ids(array &$graph): array
{
    $ids = [];
    foreach ($graph['provinces'] as $id => $province) {
        if (is_array($province) && !empty($province['supplyCenter'])) {
            $ids[] = (string)$id;
        }
    }
    sort($ids);
    return $ids;
}

function diplomacy_home_centers_from_start(array &$graph, array $start): array
{
    $homes = [];
    foreach ((array)($start['ownership'] ?? []) as $provinceId => $powerId) {
        $canonical = diplomacy_province_id($graph, $provinceId);
        $province = diplomacy_province($graph, $canonical);
        if (!$province || empty($province['supplyCenter'])) {
            continue;
        }
        $power = (string)$powerId;
        if (!isset($homes[$power])) {
            $homes[$power] = [];
        }
        $homes[$power][] = $canonical;
    }
    foreach ($homes as &$list) {
        $list = array_values(array_unique($list));
        sort($list);
    }
    unset($list);
    return $homes;
}

function diplomacy_shortest_distance(array &$graph, $fromId, array $goals): int
{
    $fromId = diplomacy_province_id($graph, $fromId);
    $goalSet = [];
    foreach ($goals as $goal) {
        $goalSet[diplomacy_province_id($graph, $goal)] = true;
    }
    if (isset($goalSet[$fromId])) {
        return 0;
    }
    $seen = [$fromId => true];
    $queue = [[$fromId, 0]];
    while ($queue) {
        [$id, $dist] = array_shift($queue);
        $province = diplomacy_province($graph, $id);
        foreach ((array)($province['neighbors'] ?? []) as $next) {
            $next = diplomacy_province_id($graph, $next);
            if (isset($seen[$next])) {
                continue;
            }
            if (isset($goalSet[$next])) {
                return $dist + 1;
            }
            $seen[$next] = true;
            $queue[] = [$next, $dist + 1];
        }
    }
    return 10000;
}

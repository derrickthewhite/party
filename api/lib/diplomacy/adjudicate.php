<?php

declare(strict_types=1);

require_once __DIR__ . '/graph.php';

function diplomacy_adjudicate(array &$graph, array $position, array $orders): array
{
    $unresolved = 0;
    $guessing = 1;
    $resolved = 2;
    $list = [];
    $byProvince = [];
    $depList = [];
    $nrOfDep = 0;
    $depth = 0;
    $notes = [];
    $noted = [];
    $rawByProvince = [];

    foreach ($orders as $raw) {
        if (is_array($raw) && !empty($raw['province'])) {
            $rawByProvince[$raw['province']] = $raw;
        }
    }

    $units = is_array($position['units'] ?? null) ? $position['units'] : [];
    foreach ($units as $unit) {
        if (!is_array($unit) || empty($unit['province']) || isset($byProvince[$unit['province']])) {
            continue;
        }
        $order = diplomacy_adjudicate_make_order($unit, $rawByProvince[$unit['province']] ?? null);
        $order['index'] = count($list);
        $list[] = $order;
        $byProvince[$unit['province']] = &$list[$order['index']];
        unset($order);
    }
    unset($byProvince);
    $byProvince = [];
    foreach ($list as $i => $_) {
        $byProvince[$list[$i]['province']] = &$list[$i];
    }

    $searchRoute = null;
    $searchRoute = function (array &$order) use (&$graph, &$byProvince) {
        $queue = [['at' => $order['province'], 'path' => []]];
        $seen = [$order['province'] => true];
        while ($queue) {
            $item = array_shift($queue);
            foreach (diplomacy_legal_destinations($graph, $item['at'], 'fleet') as $seaId) {
                if (isset($seen[$seaId])) {
                    continue;
                }
                $sea = diplomacy_province($graph, $seaId);
                if (!$sea || ($sea['kind'] ?? '') !== 'sea') {
                    continue;
                }
                $fleet = $byProvince[$seaId] ?? null;
                if (!$fleet || ($fleet['action'] ?? '') !== 'convoy' || ($fleet['convoyFrom'] ?? null) !== $order['province'] || ($fleet['convoyTo'] ?? null) !== $order['to']) {
                    continue;
                }
                $path = array_merge($item['path'], [$seaId]);
                if (diplomacy_is_legal_move($graph, $seaId, 'fleet', $order['to'])) {
                    return $path;
                }
                $seen[$seaId] = true;
                $queue[] = ['at' => $seaId, 'path' => $path];
            }
        }
        return [];
    };

    foreach ($list as $i => $_) {
        if (!empty($list[$i]['viaConvoy']) && empty($list[$i]['via'])) {
            $list[$i]['via'] = $searchRoute($list[$i]);
        }
    }

    $placeName = static function ($id) use (&$graph): string {
        $province = diplomacy_province($graph, $id);
        return $province && !empty($province['name']) ? (string)$province['name'] : (string)($id ?? '');
    };
    $powerName = static function ($id) use ($position): string {
        $power = diplomacy_power_by_id((array)($position['powers'] ?? []), $id);
        return $power && !empty($power['name']) ? (string)$power['name'] : (string)($id ?? '');
    };
    $note = static function (string $text) use (&$notes, &$noted): void {
        if (isset($noted[$text])) {
            return;
        }
        $noted[$text] = true;
        $notes[] = $text;
    };

    $directPath = function (array $order) use (&$graph): bool {
        return !empty($order['to']) && diplomacy_is_legal_move($graph, $order['province'], (string)$order['unit'], $order['to']);
    };

    $resolve = null;
    $pathSucceeds = null;
    $pathSucceeds = function (array $order) use (&$graph, &$byProvince, &$directPath, &$resolve): bool {
        if (($order['action'] ?? '') !== 'move' || empty($order['to'])) {
            return false;
        }
        if (empty($order['viaConvoy'])) {
            return $directPath($order);
        }
        $via = $order['via'] ?? [];
        if (!$via) {
            return false;
        }
        $prev = $order['province'];
        foreach ($via as $seaId) {
            $sea = diplomacy_province($graph, $seaId);
            if (!$sea || ($sea['kind'] ?? '') !== 'sea') {
                return false;
            }
            if (!diplomacy_is_legal_move($graph, $prev, 'fleet', $seaId)) {
                return false;
            }
            $fleet = $byProvince[$seaId] ?? null;
            if (!$fleet || ($fleet['action'] ?? '') !== 'convoy') {
                return false;
            }
            if (($fleet['convoyFrom'] ?? null) !== $order['province'] || ($fleet['convoyTo'] ?? null) !== $order['to']) {
                return false;
            }
            if (!$resolve((int)$fleet['index'])) {
                return false;
            }
            $prev = $seaId;
        }
        return diplomacy_is_legal_move($graph, $prev, 'fleet', $order['to']);
    };

    $isHeadToHead = function (array $order) use (&$byProvince, &$directPath): bool {
        if (($order['action'] ?? '') !== 'move' || !empty($order['viaConvoy']) || empty($order['to'])) {
            return false;
        }
        $other = $byProvince[$order['to']] ?? null;
        if (!$other || ($other['action'] ?? '') !== 'move' || !empty($other['viaConvoy']) || ($other['to'] ?? null) !== $order['province']) {
            return false;
        }
        return $directPath($order) && $directPath($other);
    };

    $movesInto = function ($province) use (&$list): array {
        $found = [];
        foreach ($list as $i => $_) {
            if (($list[$i]['action'] ?? '') === 'move' && ($list[$i]['to'] ?? null) === $province) {
                $found[] = &$list[$i];
            }
        }
        return $found;
    };

    $supportWanted = function (array $order) use (&$byProvince): bool {
        $target = $byProvince[$order['supportTarget'] ?? ''] ?? null;
        if (!$target) {
            return false;
        }
        if (empty($order['supportMove'])) {
            return ($target['action'] ?? '') !== 'move';
        }
        return ($target['action'] ?? '') === 'move' && ($target['to'] ?? null) === ($order['supportTo'] ?? null);
    };

    $supportCount = function (array $move, $skipPower) use (&$list, &$resolve): int {
        $count = 0;
        foreach ($list as $i => $_) {
            $support = $list[$i];
            if (($support['action'] ?? '') !== 'support' || empty($support['supportMove'])) {
                continue;
            }
            if (($support['supportTarget'] ?? null) !== $move['province'] || ($support['supportTo'] ?? null) !== $move['to']) {
                continue;
            }
            if ($skipPower && ($support['power'] ?? null) === $skipPower) {
                continue;
            }
            if ($resolve((int)$support['index'])) {
                $count += 1;
            }
        }
        return $count;
    };

    $holdSupportCount = function ($province) use (&$list, &$resolve): int {
        $count = 0;
        foreach ($list as $i => $_) {
            $support = $list[$i];
            if (($support['action'] ?? '') !== 'support' || !empty($support['supportMove'])) {
                continue;
            }
            if (($support['supportTarget'] ?? null) !== $province) {
                continue;
            }
            if ($resolve((int)$support['index'])) {
                $count += 1;
            }
        }
        return $count;
    };

    $attackStrength = function (array $order) use (&$byProvince, &$pathSucceeds, &$isHeadToHead, &$resolve, &$supportCount): int {
        if (!$pathSucceeds($order)) {
            return 0;
        }
        $dest = $byProvince[$order['to']] ?? null;
        $headToHead = $isHeadToHead($order);
        $leaves = $dest && ($dest['action'] ?? '') === 'move' && $resolve((int)$dest['index']);
        if (!$dest || (!$headToHead && $leaves)) {
            return 1 + $supportCount($order, null);
        }
        if (($dest['power'] ?? null) === ($order['power'] ?? null)) {
            return 0;
        }
        return 1 + $supportCount($order, $dest['power'] ?? null);
    };

    $holdStrength = function ($province) use (&$byProvince, &$resolve, &$holdSupportCount): int {
        $order = $byProvince[$province] ?? null;
        if (!$order) {
            return 0;
        }
        if (($order['action'] ?? '') === 'move') {
            return $resolve((int)$order['index']) ? 0 : 1;
        }
        return 1 + $holdSupportCount($province);
    };

    $preventStrength = function (array $order) use (&$pathSucceeds, &$isHeadToHead, &$byProvince, &$resolve, &$supportCount): int {
        if (!$pathSucceeds($order)) {
            return 0;
        }
        if ($isHeadToHead($order)) {
            $other = $byProvince[$order['to']] ?? null;
            if ($other && $resolve((int)$other['index'])) {
                return 0;
            }
        }
        return 1 + $supportCount($order, null);
    };

    $defendStrength = function (array $order) use (&$supportCount): int {
        return 1 + $supportCount($order, null);
    };

    $adjudicateMove = function (array $order) use (&$attackStrength, &$isHeadToHead, &$byProvince, &$defendStrength, &$holdStrength, &$movesInto, &$preventStrength): bool {
        $strength = $attackStrength($order);
        if ($isHeadToHead($order)) {
            if ($strength <= $defendStrength($byProvince[$order['to']])) {
                return false;
            }
        } elseif ($strength <= $holdStrength($order['to'])) {
            return false;
        }
        foreach ($movesInto($order['to']) as $rival) {
            if (($rival['province'] ?? null) === ($order['province'] ?? null)) {
                continue;
            }
            if ($strength <= $preventStrength($rival)) {
                return false;
            }
        }
        return true;
    };

    $adjudicateSupport = function (array $order) use (&$supportWanted, &$movesInto, &$pathSucceeds, &$resolve): bool {
        if (!$supportWanted($order)) {
            return false;
        }
        $dest = !empty($order['supportMove']) ? ($order['supportTo'] ?? null) : ($order['supportTarget'] ?? null);
        foreach ($movesInto($order['province']) as $attack) {
            if (($attack['power'] ?? null) === ($order['power'] ?? null)) {
                continue;
            }
            if (($attack['province'] ?? null) === $dest) {
                if ($resolve((int)$attack['index'])) {
                    return false;
                }
                continue;
            }
            if ($pathSucceeds($attack)) {
                return false;
            }
        }
        return true;
    };

    $moverSucceeds = function (array $order) use ($resolved, $guessing, &$adjudicateMove, &$resolve): bool {
        if (($order['state'] ?? 0) === $resolved) {
            return !empty($order['resolution']);
        }
        if (($order['state'] ?? 0) === $guessing) {
            return (bool)$resolve((int)$order['index']);
        }
        return $adjudicateMove($order);
    };

    $adjudicateConvoy = function (array $order) use (&$movesInto, &$moverSucceeds): bool {
        foreach ($movesInto($order['province']) as $attacker) {
            if ($moverSucceeds($attacker)) {
                return false;
            }
        }
        return true;
    };

    $adjudicateOne = function (int $nr) use (&$list, &$adjudicateMove, &$adjudicateSupport, &$adjudicateConvoy): bool {
        $order = $list[$nr];
        if (($order['action'] ?? '') === 'move') {
            return $adjudicateMove($order);
        }
        if (($order['action'] ?? '') === 'support') {
            return $adjudicateSupport($order);
        }
        if (($order['action'] ?? '') === 'convoy') {
            return $adjudicateConvoy($order);
        }
        return true;
    };

    $backup = function (int $old) use (&$list, &$depList, &$nrOfDep, &$note, $placeName, $resolved, $unresolved): void {
        $anyConvoy = false;
        $allMoves = true;
        for ($n = $old; $n < $nrOfDep; $n++) {
            $kind = $list[$depList[$n]]['action'] ?? '';
            if ($kind === 'convoy') {
                $anyConvoy = true;
            }
            if ($kind !== 'move') {
                $allMoves = false;
            }
        }
        if ($anyConvoy) {
            $where = [];
            for ($n = $old; $n < $nrOfDep; $n++) {
                $idx = $depList[$n];
                if (($list[$idx]['action'] ?? '') === 'convoy') {
                    $list[$idx]['state'] = $resolved;
                    $list[$idx]['resolution'] = false;
                    $where[] = $placeName($list[$idx]['province']);
                } else {
                    $list[$idx]['state'] = $unresolved;
                }
            }
            $note('Convoy paradox: the convoy in ' . implode(', ', $where) . ' is disrupted.');
        } elseif ($allMoves) {
            for ($n = $old; $n < $nrOfDep; $n++) {
                $idx = $depList[$n];
                $list[$idx]['state'] = $resolved;
                $list[$idx]['resolution'] = true;
            }
            $note('Circular movement succeeds.');
        } else {
            for ($n = $old; $n < $nrOfDep; $n++) {
                $idx = $depList[$n];
                $list[$idx]['state'] = $resolved;
                $list[$idx]['resolution'] = false;
            }
            $note('An unresolved cycle fails.');
        }
        $nrOfDep = $old;
    };

    $resolveAt = null;
    $resolveAt = function (int $nr) use (
        &$list,
        &$depList,
        &$nrOfDep,
        $unresolved,
        $guessing,
        $resolved,
        &$adjudicateOne,
        &$backup,
        &$resolve
    ): bool {
        $order = &$list[$nr];
        if ($order['state'] === $resolved) {
            return !empty($order['resolution']);
        }
        if (($order['action'] ?? '') === 'hold') {
            $order['state'] = $resolved;
            $order['resolution'] = true;
            return true;
        }
        if ($order['state'] === $guessing) {
            $seen = 0;
            while ($seen < $nrOfDep) {
                if ($depList[$seen++] === $nr) {
                    return !empty($order['resolution']);
                }
            }
            $depList[$nrOfDep++] = $nr;
            return !empty($order['resolution']);
        }
        $old = $nrOfDep;
        $order['resolution'] = false;
        $order['state'] = $guessing;
        $first = (bool)$adjudicateOne($nr);
        if ($nrOfDep === $old) {
            if ($order['state'] !== $resolved) {
                $order['resolution'] = $first;
                $order['state'] = $resolved;
            }
            return $first;
        }
        if (($depList[$old] ?? null) !== $nr) {
            $depList[$nrOfDep++] = $nr;
            $order['resolution'] = $first;
            return $first;
        }
        while ($nrOfDep > $old) {
            $list[$depList[--$nrOfDep]]['state'] = $unresolved;
        }
        $order['resolution'] = true;
        $order['state'] = $guessing;
        $second = (bool)$adjudicateOne($nr);
        if ($first === $second) {
            while ($nrOfDep > $old) {
                $list[$depList[--$nrOfDep]]['state'] = $unresolved;
            }
            $order['resolution'] = $first;
            $order['state'] = $resolved;
            return $first;
        }
        $backup($old);
        return (bool)$resolve($nr);
    };

    $resolve = function (int $nr) use (&$depth, &$resolveAt): bool {
        if (++$depth > 8000) {
            $depth -= 1;
            throw new RuntimeException('Resolution did not settle');
        }
        try {
            return $resolveAt($nr);
        } finally {
            $depth -= 1;
        }
    };

    foreach ($list as $i => $_) {
        if (($list[$i]['action'] ?? '') === 'convoy') {
            $resolve($i);
        }
    }
    foreach ($list as $i => $_) {
        if (($list[$i]['action'] ?? '') !== 'hold') {
            $resolve($i);
        }
    }

    $taken = [];
    foreach ($list as $i => $_) {
        if (($list[$i]['action'] ?? '') === 'move' && !empty($list[$i]['resolution'])) {
            $taken[$list[$i]['to']] = $list[$i]['province'];
        }
    }
    foreach ($list as $i => $_) {
        $moved = ($list[$i]['action'] ?? '') === 'move' && !empty($list[$i]['resolution']);
        $list[$i]['moved'] = $moved;
        $list[$i]['dislodged'] = !$moved && isset($taken[$list[$i]['province']]);
        $list[$i]['pathOk'] = ($list[$i]['action'] ?? '') === 'move' ? $pathSucceeds($list[$i]) : false;
        $list[$i]['summary'] = diplomacy_adjudicate_summary($list[$i], $placeName, $supportWanted, $graph);
    }

    $lines = [];
    $results = [];
    foreach ($list as $i => $_) {
        $order = $list[$i];
        $lines[] = $powerName($order['power']) . ' ' . (($order['unit'] ?? '') === 'fleet' ? 'fleet' : 'army') . ' '
            . $placeName($order['province']) . ' — ' . $order['summary'] . '.';
        $results[$order['province']] = [
            'action' => $order['action'],
            'to' => $order['to'] ?? null,
            'supportTarget' => $order['supportTarget'] ?? null,
            'supportTo' => $order['supportTo'] ?? null,
            'resolution' => !empty($order['resolution']),
            'moved' => !empty($order['moved']),
            'dislodged' => !empty($order['dislodged']),
            'pathOk' => !empty($order['pathOk']),
            'summary' => $order['summary'],
        ];
    }
    sort($lines);
    $text = implode("\n", $lines);
    if ($notes) {
        $text .= ($text !== '' ? "\n\n" : '') . implode("\n", $notes);
    }
    if ($text !== '') {
        $text .= "\n";
    }

    $drawn = [];
    foreach ($units as $standing) {
        if (!is_array($standing) || empty($standing['province'])) {
            continue;
        }
        $outcome = $byProvince[$standing['province']] ?? null;
        if (!$outcome) {
            continue;
        }
        $destCoast = (string)($outcome['destCoast'] ?? '');
        $unitCoast = (string)($standing['coast'] ?? '');
        $coast = '';
        if (!empty($outcome['moved']) && ($standing['unit'] ?? '') === 'fleet') {
            $coast = $destCoast;
            if ($coast === '' && !empty($outcome['to'])) {
                $inferred = diplomacy_infer_dest_coast(
                    $graph,
                    $standing['province'],
                    $unitCoast !== '' ? $unitCoast : null,
                    $outcome['to'],
                    null
                );
                $coast = $inferred ?? '';
            }
        } else {
            $coast = $unitCoast;
        }
        $drawnUnit = [
            'province' => !empty($outcome['moved']) ? $outcome['to'] : $standing['province'],
            'origin' => $standing['province'],
            'unit' => $standing['unit'],
            'power' => $standing['power'],
            'dislodged' => !empty($outcome['dislodged']),
        ];
        if ($coast !== '') {
            $drawnUnit['coast'] = $coast;
        }
        $drawn[] = $drawnUnit;
    }

    return [
        'text' => $text,
        'notes' => $notes,
        'units' => $drawn,
        'results' => $results,
        'attacker_origins' => $taken,
    ];
}

function diplomacy_adjudicate_make_order(array $unit, ?array $raw): array
{
    $order = [
        'province' => $unit['province'],
        'unit' => $unit['unit'],
        'power' => $unit['power'],
        'action' => 'hold',
        'to' => null,
        'viaConvoy' => false,
        'via' => [],
        'supportMove' => false,
        'supportTarget' => null,
        'supportTo' => null,
        'convoyFrom' => null,
        'convoyTo' => null,
        'destCoast' => '',
        'unitCoast' => (string)($unit['coast'] ?? ''),
        'supportCoast' => '',
        'state' => 0,
        'resolution' => false,
        'illegal' => false,
    ];
    if ($raw === null) {
        return $order;
    }
    $action = diplomacy_normalize_action($raw['action'] ?? '');
    if ($action === 'move') {
        $order['action'] = 'move';
        $order['to'] = $raw['to'] ?? null;
        $order['destCoast'] = (string)($raw['coast'] ?? '');
        if (!$order['to']) {
            $order['illegal'] = true;
        }
    } elseif ($action === 'convoy' && ($unit['unit'] ?? '') === 'army') {
        $order['action'] = 'move';
        $order['viaConvoy'] = true;
        $order['to'] = $raw['to'] ?? null;
        $order['via'] = isset($raw['via']) && is_array($raw['via']) ? array_values($raw['via']) : [];
        if (!$order['to']) {
            $order['illegal'] = true;
        }
    } elseif ($action === 'convoy' && ($unit['unit'] ?? '') === 'fleet') {
        $order['action'] = 'convoy';
        $order['convoyFrom'] = $raw['from'] ?? null;
        $order['convoyTo'] = $raw['to'] ?? null;
    } elseif ($action === 'support-defense') {
        $order['action'] = 'support';
        $order['supportTarget'] = $raw['target'] ?? null;
    } elseif ($action === 'support-move') {
        $order['action'] = 'support';
        $order['supportMove'] = true;
        $order['supportTarget'] = $raw['target'] ?? null;
        $order['supportTo'] = $raw['to'] ?? null;
        $order['supportCoast'] = (string)($raw['coast'] ?? '');
    } elseif ($action !== 'hold') {
        $order['illegal'] = true;
    }
    return $order;
}

function diplomacy_adjudicate_summary(array $order, callable $placeName, callable $supportWanted, array &$graph): string
{
    $dest = !empty($order['to']) ? $placeName($order['to']) : '';
    if (($order['action'] ?? '') === 'move' && !empty($order['destCoast'])) {
        $province = diplomacy_province($graph, $order['to'] ?? '');
        $coast = diplomacy_coast_by_id($province, $order['destCoast']);
        if ($coast && !empty($coast['name'])) {
            $dest .= ', ' . $coast['name'];
        }
    }
    if (($order['action'] ?? '') === 'move' && !empty($order['dislodged'])) {
        if (!empty($order['viaConvoy']) && empty($order['pathOk'])) {
            return 'convoy to ' . $dest . ' is disrupted, and the unit is dislodged';
        }
        return 'fails to move to ' . $dest . ' and is dislodged';
    }
    if (!empty($order['dislodged'])) {
        if (($order['action'] ?? '') === 'support' && $supportWanted($order) && empty($order['resolution'])) {
            return 'support is cut and the unit is dislodged';
        }
        if (($order['action'] ?? '') === 'convoy') {
            return 'is dislodged and the convoy fails';
        }
        return 'is dislodged';
    }
    if (($order['action'] ?? '') === 'hold' || !empty($order['illegal'])) {
        return 'holds';
    }
    if (($order['action'] ?? '') === 'move') {
        if (!empty($order['resolution'])) {
            return 'moves to ' . $dest;
        }
        if (!empty($order['viaConvoy']) && empty($order['pathOk'])) {
            return 'convoy to ' . $dest . ' is disrupted';
        }
        if (empty($order['pathOk'])) {
            return 'cannot reach ' . $dest;
        }
        return 'bounces';
    }
    if (($order['action'] ?? '') === 'support') {
        if (!$supportWanted($order)) {
            return 'support is void';
        }
        if (empty($order['resolution'])) {
            return 'support is cut';
        }
        if (!empty($order['supportMove'])) {
            return 'supports ' . $placeName($order['supportTarget']) . ' to ' . $placeName($order['supportTo']);
        }
        return 'supports ' . $placeName($order['supportTarget']);
    }
    if (($order['action'] ?? '') === 'convoy') {
        $from = $placeName($order['convoyFrom'] ?? null);
        $to = $placeName($order['convoyTo'] ?? null);
        if (empty($order['resolution'])) {
            return 'fails to convoy ' . $from . ' to ' . $to;
        }
        return 'convoys ' . $from . ' to ' . $to;
    }
    return 'holds';
}

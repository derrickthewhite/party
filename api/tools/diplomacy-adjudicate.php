<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/diplomacy/adjudicate.php';

$raw = stream_get_contents(STDIN);
$input = json_decode((string)$raw, true);
if (!is_array($input)) {
    fwrite(STDERR, "Expected JSON on stdin.\n");
    exit(1);
}

$graph = $input['graph'] ?? null;
if (!is_array($graph) && !empty($input['map_key'])) {
    $loaded = diplomacy_load_map((string)$input['map_key']);
    $graph = $loaded['graph'];
    if (empty($input['position'])) {
        $input['position'] = $loaded['start'];
    }
}
if (!is_array($graph)) {
    fwrite(STDERR, "graph is required.\n");
    exit(1);
}
if (isset($input['unions']) && is_array($input['unions'])) {
    $graph['unions'] = $input['unions'];
    $graph['united'] = false;
}

diplomacy_unite_provinces($graph);
$position = is_array($input['position'] ?? null) ? $input['position'] : [];
diplomacy_canonicalize_position($graph, $position);
$orders = is_array($input['orders'] ?? null) ? $input['orders'] : [];
foreach ($orders as &$order) {
    if (is_array($order)) {
        diplomacy_canonicalize_order($graph, $order);
    }
}
unset($order);

$result = diplomacy_adjudicate($graph, $position, $orders);
unset($result['attacker_origins']);
echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

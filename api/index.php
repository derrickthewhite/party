<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/routes/auth.php';
require_once __DIR__ . '/routes/games.php';
require_once __DIR__ . '/routes/messages.php';
require_once __DIR__ . '/routes/actions.php';

handle_cors_and_json_headers();

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $segments = path_segments();

    if (empty($segments)) {
        success_response(['service' => 'party-api', 'version' => 1]);
    }

    $prefix = $segments[0];
    if ($prefix === 'auth') {
        handle_auth_route($method, $segments);
    }

    if ($prefix === 'games') {
        if (count($segments) === 3 && $segments[2] === 'messages') {
            handle_messages_route($method, $segments);
        }

        if (count($segments) >= 3 && $segments[2] === 'actions') {
            handle_actions_route($method, $segments);
        }

        handle_games_route($method, $segments);
    }

    error_response('Not found.', 404);
} catch (Throwable $ex) {
    error_response('Server error.', 500, [
        'detail' => getenv('PARTY_DEBUG') === '1' ? $ex->getMessage() : null,
    ]);
}

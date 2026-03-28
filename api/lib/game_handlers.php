<?php

declare(strict_types=1);

require_once __DIR__ . '/game_types.php';
require_once __DIR__ . '/diplomacy.php';
require_once __DIR__ . '/mafia.php';
require_once __DIR__ . '/rumble.php';

function game_detail_payload_defaults(): array
{
    return [
        'mafia_state' => null,
        'diplomacy_order_progress' => null,
        'rumble_turn_progress' => null,
        'final_standings' => null,
    ];
}

function game_handler_registry(): array
{
    static $registry = null;
    if (is_array($registry)) {
        return $registry;
    }

    $registry = [
        'chat' => [],
        'stub' => [],
        'mafia' => [
            'on_start' => 'mafia_game_on_start',
            'build_detail_payload' => 'mafia_game_build_detail_payload',
        ],
        'diplomacy' => [
            'build_detail_payload' => 'diplomacy_game_build_detail_payload',
        ],
        'rumble' => [
            'on_join' => 'rumble_game_on_join',
            'on_start' => 'rumble_game_on_start',
            'build_detail_payload' => 'rumble_game_build_detail_payload',
        ],
    ];

    return $registry;
}

function game_handler_after_join(string $gameType, int $gameId, int $userId): void
{
    game_handler_invoke($gameType, 'on_join', [$gameId, $userId]);
}

function game_handler_after_start(string $gameType, int $gameId, int $actorUserId): void
{
    game_handler_invoke($gameType, 'on_start', [$gameId, $actorUserId]);
}

function game_handler_build_detail_payload(string $gameType, int $gameId, array $game, array $user): array
{
    $payload = game_handler_invoke($gameType, 'build_detail_payload', [$gameId, $game, $user]);
    return is_array($payload) ? $payload : [];
}

function game_action_row_is_visible(string $gameType, array $row): bool
{
    $type = normalize_game_type($gameType);

    if ($type === 'diplomacy' && (string)($row['action_type'] ?? '') === 'order' && ($row['revealed_at'] ?? null) === null) {
        return false;
    }

    if ($type === 'mafia' && ($row['revealed_at'] ?? null) === null) {
        return false;
    }

    return true;
}

function game_action_validate_generic_create(string $gameType, string $actionType, int $gameId = 0, int $userId = 0, array $payload = []): void
{
    $type = normalize_game_type($gameType);

    if ($type === 'rumble' && $actionType === 'order') {
        error_response('Use the rumble order endpoint for order submission.', 409);
    }

    if ($type === 'mafia') {
        mafia_validate_action_create($gameId, $userId, $actionType, $payload);
    }
}

function game_action_default_revealed_at(string $gameType): ?string
{
    $type = normalize_game_type($gameType);

    return ($type === 'diplomacy' || $type === 'mafia')
        ? null
        : gmdate('Y-m-d H:i:s');
}

function game_action_after_generic_create(string $gameType, int $gameId, int $roundNumber, string $actionType): void
{
    $type = normalize_game_type($gameType);

    if ($type === 'diplomacy' && $actionType === 'order') {
        diplomacy_maybe_auto_reveal($gameId, $roundNumber);
        return;
    }

    if ($type === 'mafia') {
        mafia_after_action_create($gameId, $roundNumber, $actionType);
    }
}

function game_handler_invoke(string $gameType, string $hook, array $args)
{
    $type = normalize_game_type($gameType);
    $registry = game_handler_registry();
    $callable = $registry[$type][$hook] ?? null;

    if ($callable === null) {
        return $hook === 'build_detail_payload' ? [] : null;
    }

    return call_user_func_array($callable, $args);
}

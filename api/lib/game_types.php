<?php

declare(strict_types=1);

function allowed_game_types(): array
{
    return ['chat', 'mafia', 'diplomacy', 'rumble', 'stub'];
}

function normalize_game_type(string $gameType): string
{
    $normalized = strtolower(trim($gameType));
    if ($normalized === '' || $normalized === 'generic') {
        return 'chat';
    }

    return $normalized;
}

function validate_game_type(string $gameType): bool
{
    return in_array(normalize_game_type($gameType), allowed_game_types(), true);
}

function default_phase_for_game_type(string $gameType): string
{
    $type = normalize_game_type($gameType);
    if ($type === 'mafia') {
        return 'start';
    }
    if ($type === 'diplomacy') {
        return 'orders';
    }
    if ($type === 'rumble') {
        return 'bidding';
    }
    if ($type === 'stub') {
        return 'chat';
    }

    return 'chat';
}

function deterministic_choice_index(string $seed, int $size): int
{
    if ($size <= 1) {
        return 0;
    }

    $hash = hash('sha256', $seed);
    $window = substr($hash, 0, 12);
    $value = (int)hexdec($window);

    return $value % $size;
}

function deterministic_pick_player_id(array $playerIds, int $gameId, int $round, string $context): int
{
    if (empty($playerIds)) {
        throw new InvalidArgumentException('Cannot pick from an empty candidate set.');
    }

    $candidates = array_values(array_map(static fn ($v): int => (int)$v, $playerIds));
    sort($candidates, SORT_NUMERIC);

    $seed = implode(':', ['v1', 'game', $gameId, 'round', $round, 'context', $context, 'candidates', implode(',', $candidates)]);
    $idx = deterministic_choice_index($seed, count($candidates));

    return $candidates[$idx];
}

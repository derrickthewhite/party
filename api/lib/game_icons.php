<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/sql.php';

function game_icon_assets_dir(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'PlayerIcons';
}

function game_icons_have_catalog_tables(): bool
{
    static $hasTables = null;
    if ($hasTables !== null) {
        return $hasTables;
    }

    $hasTables = db_schema_table_exists(db(), 'player_icons')
        && db_schema_table_exists(db(), 'player_icon_tags')
        && db_schema_table_exists(db(), 'player_icon_tag_assignments');
    return $hasTables;
}

function game_icon_catalog_reset(): void
{
    game_icon_rows(true);
    game_default_icon_catalog_for_game(0, true);
}

function game_icon_humanize_name(string $value): string
{
    $text = preg_replace('/([a-z0-9])([A-Z])/', '$1 $2', $value) ?? $value;
    $text = preg_replace('/([A-Z]+)([A-Z][a-z])/', '$1 $2', $text) ?? $text;
    $text = preg_replace('/[_-]+/', ' ', $text) ?? $text;
    $text = trim($text);
    if ($text === '') {
        return '';
    }

    return preg_replace_callback('/\b\w/', static function (array $match): string {
        return strtoupper($match[0]);
    }, $text) ?? $text;
}

function game_icon_filename_from_key($iconKey): ?string
{
    if (!is_string($iconKey)) {
        return null;
    }

    $trimmed = trim(str_replace('\\', '/', $iconKey));
    if ($trimmed === '') {
        return null;
    }

    $segments = array_values(array_filter(explode('/', $trimmed), static function ($segment) {
        return $segment !== '';
    }));
    if (empty($segments)) {
        return null;
    }

    foreach ($segments as $segment) {
        if ($segment === '.' || $segment === '..') {
            return null;
        }
    }

    $fileName = $segments[count($segments) - 1];
    if ($fileName === '' || $fileName[0] === '.' || !preg_match('/\.svg$/i', $fileName)) {
        return null;
    }

    return $fileName;
}

function game_icon_rows(bool $reset = false): array
{
    static $rows = null;
    if ($reset) {
        $rows = null;
    }
    if (is_array($rows)) {
        return $rows;
    }

    $rows = [];
    if (!game_icons_have_catalog_tables()) {
        return $rows;
    }

    $stmt = db()->query(
        'SELECT i.icon_key, i.display_name, i.hidden, i.auto_assign, '
        . 't.id AS tag_id, t.name AS tag_name, t.sort_order AS tag_sort_order '
        . 'FROM player_icons i '
        . 'LEFT JOIN player_icon_tag_assignments a ON a.icon_key = i.icon_key '
        . 'LEFT JOIN player_icon_tags t ON t.id = a.tag_id '
        . 'ORDER BY LOWER(i.display_name) ASC, i.icon_key ASC, t.sort_order ASC, LOWER(t.name) ASC, t.id ASC'
    );

    foreach ($stmt->fetchAll() as $row) {
        $iconKey = (string)$row['icon_key'];
        if (!isset($rows[$iconKey])) {
            $rows[$iconKey] = [
                'key' => $iconKey,
                'label' => (string)$row['display_name'],
                'hidden' => (int)$row['hidden'] === 1,
                'auto_assign' => (int)$row['auto_assign'] === 1,
                'tags' => [],
            ];
        }

        if ($row['tag_id'] === null) {
            continue;
        }

        $rows[$iconKey]['tags'][] = [
            'id' => (int)$row['tag_id'],
            'name' => (string)$row['tag_name'],
            'sort_order' => (int)$row['tag_sort_order'],
        ];
    }

    return $rows;
}

function game_icon_row_from_key($iconKey): ?array
{
    $fileName = game_icon_filename_from_key($iconKey);
    if ($fileName === null) {
        return null;
    }

    $rows = game_icon_rows();
    if (isset($rows[$fileName])) {
        return $rows[$fileName];
    }

    $lower = strtolower($fileName);
    foreach ($rows as $row) {
        if (strtolower($row['key']) === $lower) {
            return $row;
        }
    }

    return null;
}

function game_icon_public_entry(array $row): array
{
    return [
        'key' => $row['key'],
        'label' => $row['label'],
        'tags' => $row['tags'],
        'hidden' => !empty($row['hidden']),
        'auto_assign' => !empty($row['auto_assign']),
    ];
}

function game_icon_catalog(bool $includeHidden = false): array
{
    $catalog = [];
    foreach (game_icon_rows() as $row) {
        if (!$includeHidden && !empty($row['hidden'])) {
            continue;
        }
        $catalog[] = game_icon_public_entry($row);
    }

    return $catalog;
}

function game_auto_assign_icon_keys(): array
{
    $keys = [];
    foreach (game_icon_rows() as $row) {
        if (!empty($row['hidden']) || empty($row['auto_assign'])) {
            continue;
        }
        $keys[] = $row['key'];
    }

    return $keys;
}

function game_icon_keys_for_tag(string $tagName): array
{
    $wanted = strtolower(trim($tagName));
    if ($wanted === '') {
        return [];
    }

    $keys = [];
    foreach (game_icon_rows() as $row) {
        if (!empty($row['hidden'])) {
            continue;
        }
        foreach ($row['tags'] as $tag) {
            if (strtolower((string)$tag['name']) === $wanted) {
                $keys[] = $row['key'];
                break;
            }
        }
    }

    return $keys;
}

function game_default_icon_catalog(): array
{
    return game_auto_assign_icon_keys();
}

function game_default_icon_catalog_for_game(int $gameId, bool $reset = false): array
{
    static $catalogByGameId = [];
    if ($reset) {
        $catalogByGameId = [];
        if ($gameId <= 0) {
            return [];
        }
    }
    if (isset($catalogByGameId[$gameId]) && is_array($catalogByGameId[$gameId])) {
        return $catalogByGameId[$gameId];
    }

    $catalog = game_auto_assign_icon_keys();
    usort($catalog, static function (string $left, string $right) use ($gameId): int {
        $leftWeight = hash('sha256', $gameId . ':' . $left);
        $rightWeight = hash('sha256', $gameId . ':' . $right);
        return strcmp($leftWeight, $rightWeight);
    });

    $catalogByGameId[$gameId] = $catalog;
    return $catalogByGameId[$gameId];
}

function game_icons_have_member_icon_column(): bool
{
    static $hasColumn = null;
    if ($hasColumn !== null) {
        return $hasColumn;
    }

    $hasColumn = db_schema_column_exists(db(), 'game_members', 'icon_key');
    return $hasColumn;
}

function game_member_icon_select_sql(string $tableAlias = 'gm', string $columnAlias = 'icon_key'): string
{
    if (!game_icons_have_member_icon_column()) {
        return 'NULL AS ' . $columnAlias;
    }

    return $tableAlias . '.icon_key AS ' . $columnAlias;
}

function game_normalize_icon_key($iconKey): ?string
{
    $row = game_icon_row_from_key($iconKey);
    return $row ? $row['key'] : null;
}

function game_normalize_visible_icon_key($iconKey): ?string
{
    $row = game_icon_row_from_key($iconKey);
    if ($row === null || !empty($row['hidden'])) {
        return null;
    }

    return $row['key'];
}

function game_assign_missing_member_icons(int $gameId): void
{
    if (!game_icons_have_member_icon_column()) {
        return;
    }

    $catalog = game_default_icon_catalog_for_game($gameId);
    if (empty($catalog)) {
        return;
    }

    $stmt = db()->prepare(
        'SELECT user_id, icon_key FROM game_members WHERE game_id = :game_id ORDER BY joined_at ASC, user_id ASC'
    );
    $stmt->execute(['game_id' => $gameId]);
    $rows = $stmt->fetchAll();
    if (empty($rows)) {
        return;
    }

    $updateStmt = db()->prepare(
        'UPDATE game_members SET icon_key = :icon_key WHERE game_id = :game_id AND user_id = :user_id'
    );

    $catalogCount = count($catalog);
    foreach ($rows as $index => $row) {
        if (game_normalize_icon_key($row['icon_key'] ?? null) !== null) {
            continue;
        }

        $updateStmt->execute([
            'icon_key' => $catalog[$index % $catalogCount],
            'game_id' => $gameId,
            'user_id' => (int)$row['user_id'],
        ]);
    }
}

function game_member_icon_key(int $gameId, int $userId): ?string
{
    if (!game_icons_have_member_icon_column()) {
        return null;
    }

    game_assign_missing_member_icons($gameId);

    $stmt = db()->prepare(
        'SELECT icon_key FROM game_members WHERE game_id = :game_id AND user_id = :user_id LIMIT 1'
    );
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);

    return game_normalize_icon_key($stmt->fetchColumn());
}

function game_update_member_icon(int $gameId, int $userId, string $iconKey): string
{
    if (!game_icons_have_member_icon_column()) {
        error_response('Game member icons are not available until the latest migration is applied.', 409);
    }

    $normalizedIconKey = game_normalize_visible_icon_key($iconKey);
    if ($normalizedIconKey === null) {
        error_response('Unknown icon selection.', 422);
    }

    $stmt = db()->prepare(
        'UPDATE game_members SET icon_key = :icon_key WHERE game_id = :game_id AND user_id = :user_id'
    );
    $stmt->execute([
        'icon_key' => $normalizedIconKey,
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);

    return $normalizedIconKey;
}

<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/sql.php';

function game_default_icon_catalog(): array
{
    static $defaultCatalog = null;
    if (is_array($defaultCatalog)) {
        return $defaultCatalog;
    }

    $defaultCatalog = [
        'AmberHardHat.svg',
        'AquaAviators.svg',
        'BlackMask.svg',
        'blueHappy.svg',
        'BronzeTriangle.svg',
        'CobaltDiamond.svg',
        'CoralBeret.svg',
        'CyanHeadphones.svg',
        'ForestHex.svg',
        'GoldMonocle.svg',
        'GrayNeutral.svg',
        'GreenChill.svg',
        'IndigoWizard.svg',
        'IvoryStar.svg',
        'LavenderCloud.svg',
        'LimeEyepatch.svg',
        'MintMustache.svg',
        'NavyTopHat.svg',
        'NeonAlien.svg',
        'OliveCaptain.svg',
        'OrangeLaugh.svg',
        'PeachHalo.svg',
        'PinkBow.svg',
        'PlumBeanie.svg',
        'PurpleSmirk.svg',
        'RedGrin.svg',
        'RoseCatGlasses.svg',
        'RubySquare.svg',
        'SkyBandana.svg',
        'SlateFedora.svg',
        'TealWink.svg',
        'yellowSmile.svg',
    ];

    return $defaultCatalog;
}

function game_icon_assets_dir(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'PlayerIcons';
}

function game_icon_manifest_catalog(string $assetsDir, string $folderName): array
{
    $manifestPath = $assetsDir . DIRECTORY_SEPARATOR . $folderName . DIRECTORY_SEPARATOR . 'manifest.json';
    if (!is_file($manifestPath) || !is_readable($manifestPath)) {
        return [];
    }

    $manifest = json_decode((string)file_get_contents($manifestPath), true);
    if (!is_array($manifest)) {
        return [];
    }

    $catalog = [];
    foreach ($manifest as $entry) {
        if (!is_array($entry) || !isset($entry['file']) || !is_string($entry['file'])) {
            continue;
        }

        $fileName = trim(str_replace('\\', '/', $entry['file']));
        if ($fileName === '' || strpos($fileName, '/') !== false || !preg_match('/\.svg$/i', $fileName)) {
            continue;
        }

        $absolutePath = $assetsDir . DIRECTORY_SEPARATOR . $folderName . DIRECTORY_SEPARATOR . $fileName;
        if (!is_file($absolutePath)) {
            continue;
        }

        $catalog[] = $folderName . '/' . $fileName;
    }

    return $catalog;
}

function game_icon_directory_catalog(string $assetsDir, string $folderName): array
{
    $folderPath = $assetsDir . DIRECTORY_SEPARATOR . $folderName;
    if (!is_dir($folderPath)) {
        return [];
    }

    $entries = scandir($folderPath);
    if (!is_array($entries)) {
        return [];
    }

    $catalog = [];
    foreach ($entries as $entry) {
        if (!is_string($entry) || $entry === '' || $entry[0] === '.') {
            continue;
        }

        $absolutePath = $folderPath . DIRECTORY_SEPARATOR . $entry;
        if (!is_file($absolutePath) || !preg_match('/\.svg$/i', $entry)) {
            continue;
        }

        $catalog[] = $folderName . '/' . $entry;
    }

    natcasesort($catalog);
    return array_values($catalog);
}

function game_icon_catalog(): array
{
    static $catalog = null;
    if (is_array($catalog)) {
        return $catalog;
    }

    $catalog = game_default_icon_catalog();
    $assetsDir = game_icon_assets_dir();
    if (!is_dir($assetsDir)) {
        return $catalog;
    }

    $entries = scandir($assetsDir);
    if (!is_array($entries)) {
        return $catalog;
    }

    $folders = [];
    foreach ($entries as $entry) {
        if (!is_string($entry) || $entry === '' || $entry[0] === '.') {
            continue;
        }

        $absolutePath = $assetsDir . DIRECTORY_SEPARATOR . $entry;
        if (!is_dir($absolutePath)) {
            continue;
        }

        $folders[] = $entry;
    }

    natcasesort($folders);

    foreach ($folders as $folderName) {
        $folderCatalog = game_icon_manifest_catalog($assetsDir, $folderName);
        if (empty($folderCatalog)) {
            $folderCatalog = game_icon_directory_catalog($assetsDir, $folderName);
        }

        foreach ($folderCatalog as $iconKey) {
            if (!in_array($iconKey, $catalog, true)) {
                $catalog[] = $iconKey;
            }
        }
    }

    return $catalog;
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

    $normalized = implode('/', $segments);
    return in_array($normalized, game_icon_catalog(), true) ? $normalized : null;
}

function game_assign_missing_member_icons(int $gameId): void
{
    if (!game_icons_have_member_icon_column()) {
        return;
    }

    $catalog = game_default_icon_catalog();
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

    $normalizedIconKey = game_normalize_icon_key($iconKey);
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
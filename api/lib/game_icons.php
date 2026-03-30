<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/sql.php';

function game_icon_catalog(): array
{
    static $catalog = null;
    if (is_array($catalog)) {
        return $catalog;
    }

    $catalog = [
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

    $trimmed = trim($iconKey);
    if ($trimmed === '') {
        return null;
    }

    return in_array($trimmed, game_icon_catalog(), true) ? $trimmed : null;
}

function game_assign_missing_member_icons(int $gameId): void
{
    if (!game_icons_have_member_icon_column()) {
        return;
    }

    $catalog = game_icon_catalog();
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
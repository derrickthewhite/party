<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/sql.php';

function game_prefixed_icon_catalog(string $folderName, array $fileNames): array
{
    return array_map(static function (string $fileName) use ($folderName): string {
        return $folderName . '/' . $fileName;
    }, $fileNames);
}

function game_looks_like_human_icon_file(string $fileName): bool
{
    return preg_match('/^human\b/i', trim($fileName)) === 1;
}

function game_detected_human_icon_catalog(): array
{
    $assetsDir = game_icon_assets_dir();
    if (!is_dir($assetsDir)) {
        return [];
    }

    $catalog = [];
    $entries = scandir($assetsDir);
    if (!is_array($entries)) {
        return [];
    }

    foreach ($entries as $folderName) {
        if (!is_string($folderName) || $folderName === '' || $folderName[0] === '.') {
            continue;
        }

        $folderPath = $assetsDir . DIRECTORY_SEPARATOR . $folderName;
        if (!is_dir($folderPath)) {
            continue;
        }

        $fileEntries = scandir($folderPath);
        if (!is_array($fileEntries)) {
            continue;
        }

        foreach ($fileEntries as $fileName) {
            if (!is_string($fileName) || $fileName === '' || $fileName[0] === '.') {
                continue;
            }

            if (!game_looks_like_human_icon_file($fileName)) {
                continue;
            }

            $catalog[] = $folderName . '/' . $fileName;
        }
    }

    natcasesort($catalog);
    return array_values(array_unique($catalog));
}

function game_explicit_human_icon_catalog(): array
{
    return array_values(array_unique(array_merge(
        game_prefixed_icon_catalog('FairyTaleWarHeads', [
            'BarredHelm.svg',
            'BeardedKing.svg',
            'CrownedKing.svg',
            'GreatHelm.svg',
            'GreyHoodWoman.svg',
            'HeadbandPage.svg',
            'HeadbandWarrior.svg',
            'MailCapWarrior.svg',
            'MustachedKing.svg',
            'NasalHelm.svg',
            'SternKing.svg',
            'StripedCapPage.svg',
            'SunPriestess.svg',
            'WhiteHairedNoble.svg',
            'Witch.svg',
            'YoungKing.svg',
            'ClosedKnightHelm.svg',
            'TVisorHelm.svg',
        ]),
        game_prefixed_icon_catalog('FantasyHeads', [
            'Black Headwrap Man.svg',
            'Grenadier Mustache.svg',
            'Outlaw.svg',
            'Roman Soldier.svg',
            'Tall Shako Soldier.svg',
            'Long Bandana Skull.svg',
        ]),
        game_prefixed_icon_catalog('AliensByRegionHeads', [
            'Human A.svg',
            'Human B.svg',
            'Human C.svg',
            'Human D.svg',
            'Human E.svg',
            'Human F.svg',
            'Human G.svg',
            'Human H.svg',
            'Human I.svg',
            'Human J.svg',
            'Human K.svg',
            'Human L.svg',
            'Human M.svg',
            'Human N.svg',
            'Human R.svg',
            'Human X.svg',
            'Human Y.svg',
            'Human Z.svg',
        ]),
        game_prefixed_icon_catalog('CrimsonNetworkHeads', [
            'Human 1.svg',
            'Human 10.svg',
            'Human 11.svg',
            'Human 2.svg',
            'Human 3.svg',
            'Human 4.svg',
            'Human 5.svg',
            'Human 6.svg',
            'Human 7.svg',
            'Human 8.svg',
            'Human 9.svg',
        ]),
        game_prefixed_icon_catalog('PsiWarsHeads', [
            'Human A1.svg',
            'Human A2.svg',
            'Human A3.svg',
            'Human A4.svg',
            'Human A5.svg',
            'Human A6.svg',
            'Human A7.svg',
            'Human A8.svg',
            'Human A9.svg',
            'Human A10.svg',
            'Human A11.svg',
            'Human A12.svg',
            'Human A13.svg',
            'Human A14.svg',
            'Human A15.svg',
            'Human A16.svg',
            'Human A17.svg',
            'Human A18.svg',
            'Human A19.svg',
            'Human A20.svg',
            'Human A21.svg',
            'Human A22.svg',
            'Human A23.svg',
            'Human A24.svg',
            'Human A25.svg',
            'Human A26.svg',
            'Human A27.svg',
            'Human A28.svg',
            'Human A29.svg',
            'Human A30.svg',
            'Human B2.svg',
            'Human B3.svg',
            'Human B4.svg',
            'Human B5.svg',
            'Human B6.svg',
            'Human B7.svg',
            'Human B8.svg',
            'Human B9.svg',
            'Human B10.svg',
            'Human B11.svg',
            'Human B12.svg',
            'Human B13.svg',
            'Human b14.svg',
            'Human B15.svg',
            'Human Helmet 1.svg',
        ]),
        game_detected_human_icon_catalog()
    )));
}

function game_explicit_animal_icon_catalog(): array
{
    return array_merge(
        game_prefixed_icon_catalog('FairyTaleWarHeads', [
            'BlackCat.svg',
            'BoarHead.svg',
            'GreenDragon.svg',
            'TuskOgre.svg',
        ]),
        game_prefixed_icon_catalog('FantasyHeads', [
            'Black Horse.svg',
            'Brown Horse.svg',
            'Brown Lizard.svg',
            'Brown Mare.svg',
            'Buckskin Horse.svg',
            'Chameleon.svg',
            'Panda.svg',
            'Red Panda.svg',
            'Pterosaur.svg',
            'Raptor.svg',
            'Triceratops.svg',
            'Turtle Beast.svg',
            'Tyrannasaur.svg',
            'Wolf.svg',
            'Unicorn.svg',
            'Dragon.svg',
        ]),
        game_prefixed_icon_catalog('Classic', [
            'RoseCatGlasses.svg',
        ]),
        game_prefixed_icon_catalog('AliensByRegionHeads', [
            'Cat (Black).svg',
            'Cat (Ginger).svg',
            'Cat (Grey).svg',
            'Cat (Tiger).svg',
            'Cat (White).svg',
            'Snake (Black).svg',
            'Snake (Brown).svg',
            'Snake (Green).svg',
            'Snake (Orange).svg',
            'Mogwai A.svg',
            'Mogwai B.svg',
        ]),
        game_prefixed_icon_catalog('CrimsonNetworkHeads', [
            'GoldFox.svg',
            'SandFox.svg',
            'Scarab.svg',
            'Tiger.svg',
            'Saurian.svg',
            'Ant.svg',
            'Keleni.svg',
            'Hunter 1.svg',
            'Hunter 2.svg',
            'Grey Hairless.svg',
        ])
    );
}

function game_default_icon_catalog(): array
{
    static $defaultCatalog = null;
    if (is_array($defaultCatalog)) {
        return $defaultCatalog;
    }

    $defaultCatalog = array_values(array_unique(array_merge([
        'Classic/AmberHardHat.svg',
        'Classic/AquaAviators.svg',
        'Classic/BlackMask.svg',
        'Classic/blueHappy.svg',
        'Classic/BronzeTriangle.svg',
        'Classic/CobaltDiamond.svg',
        'Classic/CoralBeret.svg',
        'Classic/CyanHeadphones.svg',
        'Classic/ForestHex.svg',
        'Classic/GoldMonocle.svg',
        'Classic/GrayNeutral.svg',
        'Classic/GreenChill.svg',
        'Classic/IndigoWizard.svg',
        'Classic/IvoryStar.svg',
        'Classic/LavenderCloud.svg',
        'Classic/LimeEyepatch.svg',
        'Classic/MintMustache.svg',
        'Classic/NavyTopHat.svg',
        'Classic/NeonAlien.svg',
        'Classic/OliveCaptain.svg',
        'Classic/OrangeLaugh.svg',
        'Classic/PeachHalo.svg',
        'Classic/PinkBow.svg',
        'Classic/PlumBeanie.svg',
        'Classic/PurpleSmirk.svg',
        'Classic/RedGrin.svg',
        'Classic/RoseCatGlasses.svg',
        'Classic/RubySquare.svg',
        'Classic/SkyBandana.svg',
        'Classic/SlateFedora.svg',
        'Classic/TealWink.svg',
        'Classic/yellowSmile.svg',
    ], game_explicit_human_icon_catalog(), game_explicit_animal_icon_catalog())));

    return $defaultCatalog;
}

function game_default_icon_catalog_for_game(int $gameId): array
{
    static $catalogByGameId = [];
    if (isset($catalogByGameId[$gameId]) && is_array($catalogByGameId[$gameId])) {
        return $catalogByGameId[$gameId];
    }

    $catalog = game_default_icon_catalog();
    usort($catalog, static function (string $left, string $right) use ($gameId): int {
        $leftWeight = hash('sha256', $gameId . ':' . $left);
        $rightWeight = hash('sha256', $gameId . ':' . $right);
        return strcmp($leftWeight, $rightWeight);
    });

    $catalogByGameId[$gameId] = $catalog;
    return $catalogByGameId[$gameId];
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
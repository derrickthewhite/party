<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/game_icons.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/sql.php';

const PLAYER_ICON_MAX_UPLOAD_BYTES = 262144;

function player_icons_require_catalog(): void
{
    if (!game_icons_have_catalog_tables()) {
        error_response('Player icon catalog is not available until the latest migration is applied.', 409);
    }
}

function player_icon_normalize_tag_name($name): string
{
    return trim(preg_replace('/\s+/', ' ', is_string($name) ? $name : '') ?? '');
}

function player_icon_valid_filename($name): ?string
{
    if (!is_string($name)) {
        return null;
    }

    $fileName = basename(str_replace('\\', '/', trim($name)));
    if ($fileName === '' || $fileName[0] === '.') {
        return null;
    }
    if (strpos($fileName, '/') !== false || strpos($fileName, '\\') !== false) {
        return null;
    }
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 .()_-]{0,240}\.svg$/i', $fileName)) {
        return null;
    }

    return $fileName;
}

function player_icon_filename_taken(string $fileName, ?string $ignoreKey = null): bool
{
    $stmt = db()->query('SELECT icon_key FROM player_icons');
    foreach ($stmt->fetchAll() as $row) {
        $existing = (string)$row['icon_key'];
        if ($ignoreKey !== null && strcasecmp($existing, $ignoreKey) === 0) {
            continue;
        }
        if (strcasecmp($existing, $fileName) === 0) {
            return true;
        }
    }

    $assetsDir = game_icon_assets_dir();
    if (!is_dir($assetsDir)) {
        return false;
    }

    $entries = scandir($assetsDir);
    if (!is_array($entries)) {
        return false;
    }

    foreach ($entries as $entry) {
        if (!is_string($entry) || $entry === '' || $entry[0] === '.') {
            continue;
        }
        if ($ignoreKey !== null && strcasecmp($entry, $ignoreKey) === 0) {
            continue;
        }
        if (strcasecmp($entry, $fileName) === 0) {
            return true;
        }
    }

    return false;
}

function player_icon_sanitize_svg(string $contents): string
{
    if (strlen($contents) > PLAYER_ICON_MAX_UPLOAD_BYTES) {
        error_response('Icon file is too large.', 422);
    }

    if (!preg_match('/<svg\b/i', $contents)) {
        error_response('Upload a valid SVG file.', 422);
    }

    $stripped = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $contents) ?? $contents;
    $stripped = preg_replace('/<foreignObject\b[^>]*>.*?<\/foreignObject>/is', '', $stripped) ?? $stripped;
    $stripped = preg_replace('/\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $stripped) ?? $stripped;
    $stripped = preg_replace('/javascript:/i', '', $stripped) ?? $stripped;

    return $stripped;
}

function player_icon_tag_rows(): array
{
    $countSql = 'SELECT tag_id, COUNT(*) AS icon_count FROM player_icon_tag_assignments GROUP BY tag_id';
    $stmt = db()->query(
        'SELECT t.id, t.name, t.sort_order, COALESCE(c.icon_count, 0) AS icon_count '
        . 'FROM player_icon_tags t '
        . 'LEFT JOIN (' . $countSql . ') c ON c.tag_id = t.id '
        . 'ORDER BY t.sort_order ASC, LOWER(t.name) ASC, t.id ASC'
    );

    $tags = [];
    foreach ($stmt->fetchAll() as $row) {
        $tags[] = [
            'id' => (int)$row['id'],
            'name' => (string)$row['name'],
            'sort_order' => (int)$row['sort_order'],
            'icon_count' => (int)$row['icon_count'],
        ];
    }

    return $tags;
}

function player_icon_admin_payload(): array
{
    $icons = [];
    foreach (game_icon_catalog(true) as $row) {
        $icons[] = [
            'key' => $row['key'],
            'filename' => $row['key'],
            'label' => $row['label'],
            'hidden' => !empty($row['hidden']),
            'auto_assign' => !empty($row['auto_assign']),
            'tags' => $row['tags'],
        ];
    }

    return [
        'icons' => $icons,
        'tags' => player_icon_tag_rows(),
    ];
}

function player_icon_bool_from_value($value, ?bool $default = null): ?bool
{
    if ($value === null) {
        return $default;
    }
    if (is_bool($value)) {
        return $value;
    }
    if (is_int($value) || is_float($value)) {
        return ((int)$value) === 1;
    }
    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if ($normalized === '1' || $normalized === 'true' || $normalized === 'yes') {
            return true;
        }
        if ($normalized === '0' || $normalized === 'false' || $normalized === 'no') {
            return false;
        }
    }

    return $default;
}

function player_icon_update(string $iconKey, array $changes): void
{
    $row = game_icon_row_from_key($iconKey);
    if ($row === null) {
        error_response('Unknown player icon.', 404);
    }

    $displayName = array_key_exists('display_name', $changes)
        ? trim((string)$changes['display_name'])
        : $row['label'];
    if ($displayName === '') {
        error_response('A display name is required.', 422);
    }
    if (strlen($displayName) > 120) {
        error_response('Display name is too long.', 422);
    }

    $hidden = array_key_exists('hidden', $changes)
        ? (player_icon_bool_from_value($changes['hidden'], false) ? 1 : 0)
        : ($row['hidden'] ? 1 : 0);
    $autoAssign = array_key_exists('auto_assign', $changes)
        ? (player_icon_bool_from_value($changes['auto_assign'], false) ? 1 : 0)
        : ($row['auto_assign'] ? 1 : 0);

    if (array_key_exists('tag_ids', $changes)) {
        $tagIds = is_array($changes['tag_ids']) ? $changes['tag_ids'] : [];
        foreach ($tagIds as $tagId) {
            $id = (int)$tagId;
            if ($id > 0) {
                player_icon_require_tag($id);
            }
        }
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'UPDATE player_icons SET display_name = :display_name, hidden = :hidden, auto_assign = :auto_assign '
            . 'WHERE icon_key = :icon_key'
        );
        $stmt->execute([
            'display_name' => $displayName,
            'hidden' => $hidden,
            'auto_assign' => $autoAssign,
            'icon_key' => $row['key'],
        ]);

        if (array_key_exists('tag_ids', $changes)) {
            player_icon_replace_tags($row['key'], $changes['tag_ids']);
        }

        $pdo->commit();
    } catch (Throwable $ex) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $ex;
    }

    game_icon_catalog_reset();
}

function player_icon_replace_tags(string $iconKey, $tagIds): void
{
    $ids = [];
    if (is_array($tagIds)) {
        foreach ($tagIds as $tagId) {
            $id = (int)$tagId;
            if ($id > 0) {
                $ids[$id] = $id;
            }
        }
    }

    $delete = db()->prepare('DELETE FROM player_icon_tag_assignments WHERE icon_key = :icon_key');
    $delete->execute(['icon_key' => $iconKey]);

    if (empty($ids)) {
        return;
    }

    $insert = db()->prepare(
        'INSERT INTO player_icon_tag_assignments (icon_key, tag_id) VALUES (:icon_key, :tag_id)'
    );
    foreach ($ids as $tagId) {
        player_icon_require_tag($tagId);
        $insert->execute([
            'icon_key' => $iconKey,
            'tag_id' => $tagId,
        ]);
    }
}

function player_icon_require_tag(int $tagId): array
{
    $stmt = db()->prepare('SELECT id, name, sort_order FROM player_icon_tags WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $tagId]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('Unknown tag.', 404);
    }

    return [
        'id' => (int)$row['id'],
        'name' => (string)$row['name'],
        'sort_order' => (int)$row['sort_order'],
    ];
}

function player_icon_bulk_update(array $iconKeys, array $changes): int
{
    $keys = [];
    foreach ($iconKeys as $iconKey) {
        $row = game_icon_row_from_key(is_string($iconKey) ? $iconKey : '');
        if ($row === null) {
            error_response('Unknown player icon.', 404);
        }
        $keys[$row['key']] = $row['key'];
    }

    if (empty($keys)) {
        error_response('Select at least one icon.', 422);
    }

    $hidden = array_key_exists('hidden', $changes) ? player_icon_bool_from_value($changes['hidden']) : null;
    $autoAssign = array_key_exists('auto_assign', $changes) ? player_icon_bool_from_value($changes['auto_assign']) : null;
    $addTagId = isset($changes['add_tag_id']) ? (int)$changes['add_tag_id'] : 0;
    $removeTagId = isset($changes['remove_tag_id']) ? (int)$changes['remove_tag_id'] : 0;

    if ($hidden === null && $autoAssign === null && $addTagId <= 0 && $removeTagId <= 0) {
        error_response('No bulk changes were provided.', 422);
    }

    if ($addTagId > 0) {
        player_icon_require_tag($addTagId);
    }
    if ($removeTagId > 0) {
        player_icon_require_tag($removeTagId);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        if ($hidden !== null || $autoAssign !== null) {
            $assignments = [];
            $sql = 'UPDATE player_icons SET ';
            $sets = [];
            if ($hidden !== null) {
                $sets[] = 'hidden = :hidden';
                $assignments['hidden'] = $hidden ? 1 : 0;
            }
            if ($autoAssign !== null) {
                $sets[] = 'auto_assign = :auto_assign';
                $assignments['auto_assign'] = $autoAssign ? 1 : 0;
            }
            $placeholders = [];
            $index = 0;
            foreach ($keys as $key) {
                $param = 'icon_' . $index;
                $placeholders[] = ':' . $param;
                $assignments[$param] = $key;
                $index += 1;
            }
            $stmt = $pdo->prepare($sql . implode(', ', $sets) . ' WHERE icon_key IN (' . implode(', ', $placeholders) . ')');
            $stmt->execute($assignments);
        }

        if ($addTagId > 0) {
            $insert = $pdo->prepare(
                db_insert_ignore_sql(
                    'INSERT INTO player_icon_tag_assignments (icon_key, tag_id) VALUES (:icon_key, :tag_id)',
                    ['icon_key', 'tag_id']
                )
            );
            foreach ($keys as $key) {
                $insert->execute([
                    'icon_key' => $key,
                    'tag_id' => $addTagId,
                ]);
            }
        }

        if ($removeTagId > 0) {
            $delete = $pdo->prepare(
                'DELETE FROM player_icon_tag_assignments WHERE icon_key = :icon_key AND tag_id = :tag_id'
            );
            foreach ($keys as $key) {
                $delete->execute([
                    'icon_key' => $key,
                    'tag_id' => $removeTagId,
                ]);
            }
        }

        $pdo->commit();
    } catch (Throwable $ex) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $ex;
    }

    game_icon_catalog_reset();
    return count($keys);
}

function player_icon_create_tag(string $name): array
{
    $normalized = player_icon_normalize_tag_name($name);
    if ($normalized === '') {
        error_response('A tag name is required.', 422);
    }
    if (strlen($normalized) > 80) {
        error_response('Tag name is too long.', 422);
    }

    $existing = db()->prepare('SELECT id FROM player_icon_tags WHERE LOWER(name) = LOWER(:name) LIMIT 1');
    $existing->execute(['name' => $normalized]);
    if ($existing->fetch()) {
        error_response('A tag with that name already exists.', 409);
    }

    $maxStmt = db()->query('SELECT COALESCE(MAX(sort_order), 0) FROM player_icon_tags');
    $sortOrder = ((int)$maxStmt->fetchColumn()) + 1;

    $stmt = db()->prepare('INSERT INTO player_icon_tags (name, sort_order) VALUES (:name, :sort_order)');
    $stmt->execute([
        'name' => $normalized,
        'sort_order' => $sortOrder,
    ]);

    game_icon_catalog_reset();
    return player_icon_require_tag((int)db()->lastInsertId());
}

function player_icon_rename_tag(int $tagId, string $name): array
{
    player_icon_require_tag($tagId);
    $normalized = player_icon_normalize_tag_name($name);
    if ($normalized === '') {
        error_response('A tag name is required.', 422);
    }
    if (strlen($normalized) > 80) {
        error_response('Tag name is too long.', 422);
    }

    $existing = db()->prepare(
        'SELECT id FROM player_icon_tags WHERE LOWER(name) = LOWER(:name) AND id <> :id LIMIT 1'
    );
    $existing->execute([
        'name' => $normalized,
        'id' => $tagId,
    ]);
    if ($existing->fetch()) {
        error_response('A tag with that name already exists.', 409);
    }

    $stmt = db()->prepare('UPDATE player_icon_tags SET name = :name WHERE id = :id');
    $stmt->execute([
        'name' => $normalized,
        'id' => $tagId,
    ]);

    game_icon_catalog_reset();
    return player_icon_require_tag($tagId);
}

function player_icon_delete_tag(int $tagId): void
{
    player_icon_require_tag($tagId);
    $stmt = db()->prepare('DELETE FROM player_icon_tags WHERE id = :id');
    $stmt->execute(['id' => $tagId]);
    game_icon_catalog_reset();
}

function player_icon_upload(array $file): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        error_response('Unable to read the uploaded icon.', 422);
    }

    $fileName = player_icon_valid_filename((string)($file['name'] ?? ''));
    if ($fileName === null) {
        error_response('Upload an SVG whose filename uses letters, numbers, spaces, or ()_- only.', 422);
    }
    if (player_icon_filename_taken($fileName)) {
        error_response('An icon with that filename already exists.', 409);
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_file($tmpPath)) {
        error_response('Unable to read the uploaded icon.', 422);
    }

    $contents = (string)file_get_contents($tmpPath);
    $sanitized = player_icon_sanitize_svg($contents);

    $assetsDir = game_icon_assets_dir();
    if (!is_dir($assetsDir) && !mkdir($assetsDir, 0777, true) && !is_dir($assetsDir)) {
        error_response('Unable to store the uploaded icon.', 500);
    }

    $destPath = $assetsDir . DIRECTORY_SEPARATOR . $fileName;
    if (file_exists($destPath)) {
        error_response('An icon with that filename already exists.', 409);
    }

    $displayName = game_icon_humanize_name(preg_replace('/\.svg$/i', '', $fileName) ?? $fileName);
    if ($displayName === '') {
        $displayName = $fileName;
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO player_icons (icon_key, display_name, hidden, auto_assign) '
            . 'VALUES (:icon_key, :display_name, 0, 0)'
        );
        $stmt->execute([
            'icon_key' => $fileName,
            'display_name' => $displayName,
        ]);

        if (file_put_contents($destPath, $sanitized) === false) {
            throw new RuntimeException('Unable to write uploaded icon.');
        }

        $pdo->commit();
    } catch (Throwable $ex) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (is_file($destPath)) {
            @unlink($destPath);
        }
        throw $ex;
    }

    game_icon_catalog_reset();
    return $fileName;
}

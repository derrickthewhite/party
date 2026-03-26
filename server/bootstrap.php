<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';

$cfg = config()['db'];
$driver = strtolower(trim((string)($cfg['driver'] ?? 'mysql')));
if ($driver !== 'sqlite') {
    exit(0);
}

$sqlitePath = (string)($cfg['sqlite_path'] ?? '');
if ($sqlitePath === '') {
    fwrite(STDERR, "SQLite path is not configured.\n");
    exit(1);
}

$dataDir = dirname($sqlitePath);
if (!is_dir($dataDir) && !mkdir($dataDir, 0777, true) && !is_dir($dataDir)) {
    fwrite(STDERR, "Unable to create SQLite data directory.\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $sqlitePath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
]);

$pdo->exec('PRAGMA foreign_keys = ON');
$pdo->exec('PRAGMA journal_mode = WAL');
$pdo->exec('PRAGMA busy_timeout = 5000');

apply_sql_file($pdo, __DIR__ . '/../sql/sqlite/001_schema.sql');
apply_sql_file($pdo, __DIR__ . '/../sql/sqlite/002_seed.sql');
apply_rumble_catalog_seed($pdo, __DIR__ . '/../sql/018_rumble_ability_catalog_tables.sql');

function apply_sql_file(PDO $pdo, string $filePath): void
{
    $sql = file_get_contents($filePath);
    if ($sql === false) {
        throw new RuntimeException('Unable to read SQL file: ' . $filePath);
    }

    $trimmed = trim($sql);
    if ($trimmed === '') {
        return;
    }

    $pdo->exec($trimmed);
}

function apply_rumble_catalog_seed(PDO $pdo, string $filePath): void
{
    $source = file_get_contents($filePath);
    if ($source === false) {
        throw new RuntimeException('Unable to read rumble ability seed file.');
    }

    $templateSql = extract_insert_statement($source, 'rumble_ability_templates');
    $definitionSql = extract_insert_statement($source, 'rumble_ability_definitions');

    $templateSql = str_replace(
        [
            "ON DUPLICATE KEY UPDATE\n  `template_kind` = VALUES(`template_kind`),\n  `template_inputs_json` = VALUES(`template_inputs_json`),\n  `is_enabled` = VALUES(`is_enabled`),\n  `updated_at` = CURRENT_TIMESTAMP;",
            "ON DUPLICATE KEY UPDATE\r\n  `template_kind` = VALUES(`template_kind`),\r\n  `template_inputs_json` = VALUES(`template_inputs_json`),\r\n  `is_enabled` = VALUES(`is_enabled`),\r\n  `updated_at` = CURRENT_TIMESTAMP;",
        ],
        "ON CONFLICT(`template_key`) DO UPDATE SET `template_kind` = excluded.`template_kind`, `template_inputs_json` = excluded.`template_inputs_json`, `is_enabled` = excluded.`is_enabled`, `updated_at` = CURRENT_TIMESTAMP;",
        $templateSql
    );

    $definitionSql = str_replace(
        [
            "ON DUPLICATE KEY UPDATE\n  `ability_name` = VALUES(`ability_name`),\n  `template_type` = VALUES(`template_type`),\n  `template_key` = VALUES(`template_key`),\n  `tags_json` = VALUES(`tags_json`),\n  `description` = VALUES(`description`),\n  `template_params_json` = VALUES(`template_params_json`),\n  `is_enabled` = VALUES(`is_enabled`),\n  `updated_at` = CURRENT_TIMESTAMP;",
            "ON DUPLICATE KEY UPDATE\r\n  `ability_name` = VALUES(`ability_name`),\r\n  `template_type` = VALUES(`template_type`),\r\n  `template_key` = VALUES(`template_key`),\r\n  `tags_json` = VALUES(`tags_json`),\r\n  `description` = VALUES(`description`),\r\n  `template_params_json` = VALUES(`template_params_json`),\r\n  `is_enabled` = VALUES(`is_enabled`),\r\n  `updated_at` = CURRENT_TIMESTAMP;",
        ],
        "ON CONFLICT(`ability_id`) DO UPDATE SET `ability_name` = excluded.`ability_name`, `template_type` = excluded.`template_type`, `template_key` = excluded.`template_key`, `tags_json` = excluded.`tags_json`, `description` = excluded.`description`, `template_params_json` = excluded.`template_params_json`, `is_enabled` = excluded.`is_enabled`, `updated_at` = CURRENT_TIMESTAMP;",
        $definitionSql
    );

    $pdo->exec(trim($templateSql));
    $pdo->exec(trim($definitionSql));
}

function extract_insert_statement(string $source, string $tableName): string
{
    $pattern = '/INSERT INTO `' . preg_quote($tableName, '/') . '`.*?;/s';
    if (!preg_match($pattern, $source, $matches)) {
        throw new RuntimeException('Could not extract seed statement for ' . $tableName . '.');
    }

    return $matches[0];
}
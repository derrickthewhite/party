<?php

declare(strict_types=1);

require_once __DIR__ . '/../config.php';

function db_driver_name(?array $cfg = null): string
{
    $dbConfig = $cfg ?? config()['db'];
    $driver = strtolower(trim((string)($dbConfig['driver'] ?? 'mysql')));
    return $driver === 'sqlite' ? 'sqlite' : 'mysql';
}

function db_is_sqlite(?array $cfg = null): bool
{
    return db_driver_name($cfg) === 'sqlite';
}

function db_now_sql(): string
{
    return db_is_sqlite() ? 'CURRENT_TIMESTAMP' : 'NOW()';
}

function db_greatest_sql(string $leftExpr, string $rightExpr): string
{
    return db_is_sqlite()
        ? 'MAX(' . $leftExpr . ', ' . $rightExpr . ')'
        : 'GREATEST(' . $leftExpr . ', ' . $rightExpr . ')';
}

function db_insert_value_sql(string $column): string
{
    return db_is_sqlite() ? 'excluded.' . $column : 'VALUES(' . $column . ')';
}

function db_upsert_sql(string $insertSql, array $conflictColumns, array $updateAssignments): string
{
    $assignments = [];
    foreach ($updateAssignments as $column => $expression) {
        $assignments[] = $column . ' = ' . $expression;
    }

    if (db_is_sqlite()) {
        return $insertSql
            . ' ON CONFLICT (' . implode(', ', $conflictColumns) . ') DO UPDATE SET '
            . implode(', ', $assignments);
    }

    return $insertSql . ' ON DUPLICATE KEY UPDATE ' . implode(', ', $assignments);
}

function db_insert_ignore_sql(string $insertSql, array $conflictColumns): string
{
    if (db_is_sqlite()) {
        return $insertSql . ' ON CONFLICT (' . implode(', ', $conflictColumns) . ') DO NOTHING';
    }

    return preg_replace('/^INSERT\s+INTO\s+/i', 'INSERT IGNORE INTO ', $insertSql, 1) ?? $insertSql;
}

function db_schema_table_exists(PDO $pdo, string $tableName): bool
{
    if (db_is_sqlite()) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = :table_name");
        $stmt->execute(['table_name' => $tableName]);
        return (int)$stmt->fetchColumn() > 0;
    }

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES '
        . 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name'
    );
    $stmt->execute(['table_name' => $tableName]);
    return (int)$stmt->fetchColumn() > 0;
}

function db_schema_column_exists(PDO $pdo, string $tableName, string $columnName): bool
{
    if (db_is_sqlite()) {
        $stmt = $pdo->query('PRAGMA table_info(' . $tableName . ')');
        $rows = $stmt ? $stmt->fetchAll() : [];
        foreach ($rows as $row) {
            if ((string)($row['name'] ?? '') === $columnName) {
                return true;
            }
        }
        return false;
    }

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS '
        . 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );
    $stmt->execute([
        'table_name' => $tableName,
        'column_name' => $columnName,
    ]);
    return (int)$stmt->fetchColumn() > 0;
}

function db_apply_connection_pragmas(PDO $pdo): void
{
    if (!db_is_sqlite()) {
        return;
    }

    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');
}
<?php

declare(strict_types=1);

require_once __DIR__ . '/sql.php';
require_once __DIR__ . '/../config.php';

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = config()['db'];
    $driver = db_driver_name($cfg);
    if ($driver === 'sqlite') {
        $sqlitePath = (string)($cfg['sqlite_path'] ?? '');
        if ($sqlitePath === '') {
            throw new RuntimeException('SQLite database path is not configured.');
        }

        $dataDir = dirname($sqlitePath);
        if (!is_dir($dataDir)) {
            mkdir($dataDir, 0777, true);
        }

        $dsn = 'sqlite:' . $sqlitePath;
        $username = null;
        $password = null;
    } else {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            $cfg['host'],
            $cfg['port'],
            $cfg['name'],
            $cfg['charset']
        );
        $username = $cfg['user'];
        $password = $cfg['pass'];
    }

    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    db_apply_connection_pragmas($pdo);

    return $pdo;
}

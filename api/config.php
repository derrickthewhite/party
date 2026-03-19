<?php

declare(strict_types=1);

function config(): array
{
    static $cfg = null;

    if ($cfg !== null) {
        return $cfg;
    }

    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? null) === '443');

    $cfg = [
        'db' => [
            'host' => getenv('PARTY_DB_HOST') ?: '127.0.0.1',
            'port' => getenv('PARTY_DB_PORT') ?: '3306',
            'name' => getenv('PARTY_DB_NAME') ?: 'u709836584_party',
            'user' => getenv('PARTY_DB_USER') ?: 'root',
            'pass' => getenv('PARTY_DB_PASS') ?: '',
            'charset' => 'utf8mb4',
        ],
        'session' => [
            'name' => 'party_session',
            'secure' => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax',
        ],
        'cors' => [
            'allow_origin' => getenv('PARTY_ALLOW_ORIGIN') ?: '*',
        ],
    ];

    return $cfg;
}

<?php

declare(strict_types=1);

function config_env_value(array $keys, string $default = ''): string
{
    foreach ($keys as $key) {
        $value = getenv($key);
        if ($value !== false && $value !== '') {
            return (string)$value;
        }

        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return (string)$_ENV[$key];
        }

        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return (string)$_SERVER[$key];
        }
    }

    return $default;
}

function config_env_bool(array $keys, bool $default = false): bool
{
    $raw = strtolower(trim(config_env_value($keys, $default ? '1' : '0')));
    if (in_array($raw, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }
    if (in_array($raw, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }
    return $default;
}

function config_apply_overrides(array $cfg): array
{
    $localConfigPath = __DIR__ . '/config.local.php';
    if (!is_file($localConfigPath)) {
        return $cfg;
    }

    $local = require $localConfigPath;
    if (!is_array($local)) {
        return $cfg;
    }

    if (isset($local['db']) && is_array($local['db'])) {
        foreach (['driver', 'host', 'port', 'name', 'user', 'pass', 'charset', 'sqlite_path'] as $key) {
            if (array_key_exists($key, $local['db']) && $local['db'][$key] !== null && $local['db'][$key] !== '') {
                $cfg['db'][$key] = (string)$local['db'][$key];
            }
        }
    }

    if (isset($local['session']) && is_array($local['session']) && array_key_exists('save_path', $local['session'])) {
        $cfg['session']['save_path'] = (string)$local['session']['save_path'];
    }

    if (isset($local['cors']) && is_array($local['cors']) && array_key_exists('allow_origin', $local['cors'])) {
        $cfg['cors']['allow_origin'] = (string)$local['cors']['allow_origin'];
    }

    if (isset($local['auth']) && is_array($local['auth']) && array_key_exists('enforce_https', $local['auth'])) {
        $cfg['auth']['enforce_https'] = (bool)$local['auth']['enforce_https'];
    }

    return $cfg;
}

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
            'driver' => config_env_value(['PARTY_DB_DRIVER', 'DB_DRIVER'], 'mysql'),
            'host' => config_env_value(['PARTY_DB_HOST', 'DB_HOST'], '127.0.0.1'),
            'port' => config_env_value(['PARTY_DB_PORT', 'DB_PORT'], '3306'),
            'name' => config_env_value(['PARTY_DB_NAME', 'DB_NAME'], 'u709836584_party'),
            'user' => config_env_value(['PARTY_DB_USER', 'DB_USER'], 'root'),
            'pass' => config_env_value(['PARTY_DB_PASS', 'DB_PASS'], ''),
            'charset' => 'utf8mb4',
            'sqlite_path' => config_env_value(['PARTY_DB_SQLITE_PATH', 'DB_SQLITE_PATH'], dirname(__DIR__) . '/data/party.sqlite'),
        ],
        'session' => [
            'name' => 'party_session',
            'secure' => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax',
            'save_path' => config_env_value(['PARTY_SESSION_SAVE_PATH'], ''),
        ],
        'cors' => [
            'allow_origin' => config_env_value(['PARTY_ALLOW_ORIGIN'], '*'),
        ],
        'auth' => [
            'enforce_https' => config_env_bool(['PARTY_AUTH_ENFORCE_HTTPS'], true),
            'srp_challenge_ttl_seconds' => 300,
        ],
    ];

    $cfg = config_apply_overrides($cfg);

    return $cfg;
}

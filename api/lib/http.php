<?php

declare(strict_types=1);

function handle_cors_and_json_headers(): void
{
    $allowOrigin = config()['cors']['allow_origin'];
    $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($allowOrigin === '*') {
        $allowOrigin = $requestOrigin !== '' ? $requestOrigin : '*';
    }

    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: ' . $allowOrigin);
    if ($allowOrigin !== '*') {
        header('Access-Control-Allow-Credentials: true');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        error_response('Invalid JSON body.', 400);
    }

    return $decoded;
}

function success_response(array $data = [], int $status = 200): void
{
    http_response_code($status);
    echo json_encode([
        'ok' => true,
        'data' => $data,
    ]);
    exit;
}

function error_response(string $error, int $status = 400, array $meta = []): void
{
    http_response_code($status);
    echo json_encode([
        'ok' => false,
        'error' => $error,
        'meta' => $meta,
    ]);
    exit;
}

function require_method(string $method): void
{
    $actual = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($actual !== strtoupper($method)) {
        error_response('Method not allowed.', 405);
    }
}

function request_is_https(): bool
{
    if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? null) === '443')) {
        return true;
    }

    $forwardedProto = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($forwardedProto === 'https') {
        return true;
    }

    return false;
}

function require_https_request(): void
{
    $enforceHttps = (bool)(config()['auth']['enforce_https'] ?? false);
    if (!$enforceHttps) {
        return;
    }

    if (!request_is_https()) {
        error_response('HTTPS is required for authentication endpoints.', 400);
    }
}

function path_segments(): array
{
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (!is_string($uriPath)) {
        return [];
    }

    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    $normalizedPath = str_replace('\\', '/', $uriPath);

    if ($scriptDir !== '' && $scriptDir !== '/' && str_starts_with($normalizedPath, $scriptDir)) {
        $normalizedPath = substr($normalizedPath, strlen($scriptDir));
    }

    $normalizedPath = trim($normalizedPath, '/');
    return $normalizedPath === '' ? [] : explode('/', $normalizedPath);
}

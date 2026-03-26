<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$normalizedPath = is_string($uriPath) ? $uriPath : '/';

if ($normalizedPath === '/api' || str_starts_with($normalizedPath, '/api/')) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require $root . '/api/index.php';
    return;
}

$staticPath = realpath($root . $normalizedPath);
if ($staticPath !== false && str_starts_with($staticPath, $root) && is_file($staticPath)) {
    return false;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Not found.';
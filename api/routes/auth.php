<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/auth.php';

function handle_auth_route(string $method, array $segments): void
{
    if (count($segments) !== 2 || $segments[0] !== 'auth') {
        error_response('Not found.', 404);
    }

    $endpoint = $segments[1];

    if ($endpoint === 'signup') {
        require_method('POST');
        auth_signup();
    }

    if ($endpoint === 'signin') {
        require_method('POST');
        auth_signin();
    }

    if ($endpoint === 'signout') {
        require_method('POST');
        auth_signout();
    }

    if ($endpoint === 'me') {
        require_method('GET');
        auth_me();
    }

    error_response('Not found.', 404);
}

function auth_signup(): void
{
    $body = json_input();

    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $inviteKey = (string)($body['invite_key'] ?? '');

    if ($username === '' || strlen($username) > 40) {
        error_response('Username is required and must be at most 40 characters.', 422);
    }

    if ($password === '') {
        error_response('Password is required.', 422);
    }

    if ($inviteKey === '') {
        error_response('Invite key is required.', 422);
    }

    $keyStmt = db()->prepare('SELECT setting_value FROM app_settings WHERE setting_key = :key LIMIT 1');
    $keyStmt->execute(['key' => 'signup_invite_key']);
    $expectedKey = (string)($keyStmt->fetchColumn() ?: '');

    if ($expectedKey === '' || !hash_equals($expectedKey, $inviteKey)) {
        error_response('Invalid invite key.', 403);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);

    try {
        $stmt = db()->prepare('INSERT INTO users (username, password_hash) VALUES (:username, :password_hash)');
        $stmt->execute([
            'username' => $username,
            'password_hash' => $hash,
        ]);
    } catch (PDOException $ex) {
        if ((int)$ex->getCode() === 23000) {
            error_response('Username is already taken.', 409);
        }
        throw $ex;
    }

    success_response(['message' => 'Account created.'], 201);
}

function auth_signin(): void
{
    $body = json_input();

    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if ($username === '' || $password === '') {
        error_response('Username and password are required.', 422);
    }

    $stmt = db()->prepare('SELECT id, username, password_hash, is_active FROM users WHERE username = :username LIMIT 1');
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();

    if (!$user || (int)$user['is_active'] !== 1 || !password_verify($password, (string)$user['password_hash'])) {
        error_response('Invalid credentials.', 401);
    }

    set_user_session((int)$user['id']);

    $updateStmt = db()->prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id');
    $updateStmt->execute(['id' => (int)$user['id']]);

    success_response([
        'user' => [
            'id' => (int)$user['id'],
            'username' => (string)$user['username'],
        ],
    ]);
}

function auth_signout(): void
{
    clear_user_session();
    success_response(['message' => 'Signed out.']);
}

function auth_me(): void
{
    $user = current_user();
    if ($user === null) {
        error_response('Unauthorized.', 401);
    }

    success_response(['user' => $user]);
}

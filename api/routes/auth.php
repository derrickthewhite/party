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
        return;
    }

    if ($endpoint === 'signin') {
        require_method('POST');
        auth_signin();
        return;
    }

    if ($endpoint === 'signout') {
        require_method('POST');
        auth_signout();
        return;
    }

    if ($endpoint === 'me') {
        require_method('GET');
        auth_me();
        return;
    }

    if ($endpoint === 'test') {
        require_method('GET');
        auth_test();
        return;
    }

    error_response('Not found.', 404, [
        'endpoint' => $endpoint,
    ]);
}

function auth_error_response(string $message, int $status, string $stage, ?Throwable $ex = null, array $meta = []): void
{
    $baseMeta = [
        'stage' => $stage,
    ];

    if ($ex !== null) {
        $baseMeta['exception'] = [
            'type' => get_class($ex),
            'code' => (string)$ex->getCode(),
            'message' => $ex->getMessage(),
            'file' => $ex->getFile(),
            'line' => $ex->getLine(),
        ];
    }

    error_response($message, $status, array_merge($baseMeta, $meta));
}

function auth_signup(): void
{
    try {
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

        try {
            $keyStmt = db()->prepare('SELECT setting_value FROM app_settings WHERE setting_key = :key LIMIT 1');
            $keyStmt->execute(['key' => 'signup_invite_key']);
            $expectedKey = (string)($keyStmt->fetchColumn() ?: '');
        } catch (Throwable $ex) {
            auth_error_response('Unable to validate invite key right now.', 500, 'signup.invite_lookup', $ex);
        }

        if ($expectedKey === '') {
            auth_error_response('Signup invite key is not configured on the server.', 500, 'signup.invite_missing', null, [
                'setting_key' => 'signup_invite_key',
            ]);
        }

        if (!hash_equals($expectedKey, $inviteKey)) {
            error_response('Invalid invite key.', 403, [
                'stage' => 'signup.invite_compare',
                'provided_length' => strlen($inviteKey),
                'expected_length' => strlen($expectedKey),
            ]);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($hash) || $hash === '') {
            auth_error_response('Unable to process password at this time.', 500, 'signup.hash_password');
        }

        try {
            $stmt = db()->prepare('INSERT INTO users (username, password_hash) VALUES (:username, :password_hash)');
            $stmt->execute([
                'username' => $username,
                'password_hash' => $hash,
            ]);
        } catch (PDOException $ex) {
            if ((int)$ex->getCode() === 23000) {
                error_response('Username is already taken.', 409, [
                    'stage' => 'signup.insert_user',
                ]);
            }
            auth_error_response('Unable to create account right now.', 500, 'signup.insert_user', $ex);
        }

        success_response(['message' => 'Account created.'], 201);
    } catch (Throwable $ex) {
        auth_error_response('Signup failed unexpectedly.', 500, 'signup.unexpected', $ex);
    }
}

function auth_signin(): void
{
    try {
        $body = json_input();

        $username = trim((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');

        if ($username === '' || $password === '') {
            error_response('Username and password are required.', 422);
        }

        try {
            $stmt = db()->prepare('SELECT id, username, password_hash, is_active FROM users WHERE username = :username LIMIT 1');
            $stmt->execute(['username' => $username]);
            $user = $stmt->fetch();
        } catch (Throwable $ex) {
            auth_error_response('Unable to check credentials right now.', 500, 'signin.lookup_user', $ex);
        }

        if (!$user || (int)$user['is_active'] !== 1 || !password_verify($password, (string)$user['password_hash'])) {
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.verify_credentials',
            ]);
        }

        set_user_session((int)$user['id']);

        try {
            $updateStmt = db()->prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id');
            $updateStmt->execute(['id' => (int)$user['id']]);
        } catch (Throwable $ex) {
            auth_error_response('Signed in, but failed to record login time.', 500, 'signin.update_last_login', $ex, [
                'user_id' => (int)$user['id'],
            ]);
        }

        success_response([
            'user' => [
                'id' => (int)$user['id'],
                'username' => (string)$user['username'],
            ],
        ]);
    } catch (Throwable $ex) {
        auth_error_response('Sign in failed unexpectedly.', 500, 'signin.unexpected', $ex);
    }
}

function auth_signout(): void
{
    try {
        clear_user_session();
        success_response(['message' => 'Signed out.']);
    } catch (Throwable $ex) {
        auth_error_response('Failed to sign out cleanly.', 500, 'signout.clear_session', $ex);
    }
}

function auth_me(): void
{
    try {
        $user = current_user();
        if ($user === null) {
            error_response('Unauthorized.', 401, [
                'stage' => 'me.current_user',
            ]);
        }

        success_response(['user' => $user]);
    } catch (Throwable $ex) {
        auth_error_response('Unable to load current user.', 500, 'me.current_user', $ex);
    }
}

function auth_test(): void
{
    $dbCfg = config()['db'];

    $report = [
        'request' => [
            'method' => strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            'uri' => (string)($_SERVER['REQUEST_URI'] ?? ''),
            'timestamp_utc' => gmdate('c'),
        ],
        'effective_config' => [
            'db' => [
                'host' => (string)$dbCfg['host'],
                'port' => (string)$dbCfg['port'],
                'name' => (string)$dbCfg['name'],
                'user' => (string)$dbCfg['user'],
                'password_set' => ((string)$dbCfg['pass']) !== '',
            ],
        ],
        'checks' => [
            'database' => [
                'ok' => false,
            ],
            'invite_key' => [
                'configured' => false,
                'length' => 0,
                'preview' => '',
            ],
        ],
        'session' => [
            'status' => session_status(),
            'has_cookie' => isset($_COOKIE[session_name()]),
        ],
        'current_user' => null,
    ];

    try {
        db()->query('SELECT 1');
        $report['checks']['database']['ok'] = true;
    } catch (Throwable $ex) {
        $report['checks']['database']['error'] = [
            'type' => get_class($ex),
            'code' => (string)$ex->getCode(),
            'message' => $ex->getMessage(),
        ];
    }

    try {
        $stmt = db()->prepare('SELECT setting_value FROM app_settings WHERE setting_key = :key LIMIT 1');
        $stmt->execute(['key' => 'signup_invite_key']);
        $inviteKey = (string)($stmt->fetchColumn() ?: '');

        if ($inviteKey !== '') {
            $report['checks']['invite_key']['configured'] = true;
            $report['checks']['invite_key']['length'] = strlen($inviteKey);

            if (strlen($inviteKey) <= 4) {
                $report['checks']['invite_key']['preview'] = str_repeat('*', strlen($inviteKey));
            } else {
                $report['checks']['invite_key']['preview'] = substr($inviteKey, 0, 2)
                    . str_repeat('*', strlen($inviteKey) - 4)
                    . substr($inviteKey, -2);
            }
        }
    } catch (Throwable $ex) {
        $report['checks']['invite_key']['error'] = [
            'type' => get_class($ex),
            'code' => (string)$ex->getCode(),
            'message' => $ex->getMessage(),
        ];
    }

    try {
        $report['current_user'] = current_user();
        $report['session']['status'] = session_status();
        $report['session']['has_cookie'] = isset($_COOKIE[session_name()]);
    } catch (Throwable $ex) {
        $report['session']['error'] = [
            'type' => get_class($ex),
            'code' => (string)$ex->getCode(),
            'message' => $ex->getMessage(),
        ];
    }

    success_response([
        'message' => 'Auth diagnostics endpoint.',
        'report' => $report,
    ]);
}

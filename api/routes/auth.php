<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/srp.php';

function handle_auth_route(string $method, array $segments): void
{
    if (count($segments) < 2 || $segments[0] !== 'auth') {
        error_response('Not found.', 404);
    }

    $endpoint = $segments[1];
    $subEndpoint = $segments[2] ?? '';

    if ($endpoint === 'signup' && count($segments) === 2) {
        require_method('POST');
        auth_signup();
        return;
    }

    if ($endpoint === 'signin' && $subEndpoint === 'start') {
        require_method('POST');
        auth_signin_start();
        return;
    }

    if ($endpoint === 'signin' && $subEndpoint === 'finish') {
        require_method('POST');
        auth_signin_finish();
        return;
    }

    if ($endpoint === 'signin' && count($segments) === 2) {
        error_response('Use /auth/signin/start and /auth/signin/finish.', 410);
        return;
    }

    if ($endpoint === 'signout' && count($segments) === 2) {
        require_method('POST');
        auth_signout();
        return;
    }

    if ($endpoint === 'me' && count($segments) === 2) {
        require_method('GET');
        auth_me();
        return;
    }

    if ($endpoint === 'test' && count($segments) === 2) {
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

function auth_pending_key(string $username): string
{
    return 'srp_signin_' . strtolower($username);
}

function auth_load_user_for_signin(string $username): ?array
{
    $stmt = db()->prepare('SELECT id, username, is_active, srp_salt, srp_verifier FROM users WHERE username = :username LIMIT 1');
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();

    if (!$user || (int)$user['is_active'] !== 1) {
        return null;
    }

    if ((string)$user['srp_salt'] === '' || (string)$user['srp_verifier'] === '') {
        return null;
    }

    return [
        'id' => (int)$user['id'],
        'username' => (string)$user['username'],
        'srp_salt' => strtolower((string)$user['srp_salt']),
        'srp_verifier' => strtolower((string)$user['srp_verifier']),
    ];
}

function auth_make_fake_signin_user(string $username): array
{
    $saltHex = srp_random_secret_hex(32);
    $xHex = srp_hash_string_hex($username . ':' . srp_random_secret_hex(16));
    $verifierHex = srp_make_verifier_hex($xHex);

    return [
        'id' => 0,
        'username' => $username,
        'srp_salt' => $saltHex,
        'srp_verifier' => $verifierHex,
    ];
}

function auth_signup(): void
{
    try {
        require_https_request();
        srp_require_runtime();

        $body = json_input();

        $username = trim((string)($body['username'] ?? ''));
        $saltHex = (string)($body['salt'] ?? '');
        $verifierHex = (string)($body['verifier'] ?? '');
        $inviteKey = (string)($body['invite_key'] ?? '');

        if ($username === '' || strlen($username) > 40) {
            error_response('Username is required and must be at most 40 characters.', 422);
        }

        $validatedSalt = srp_validate_hex($saltHex, 64);
        if ($validatedSalt === null || strlen($validatedSalt) !== 64) {
            error_response('A valid SRP salt is required.', 422);
        }

        $params = srp_params();
        $validatedVerifier = srp_validate_hex($verifierHex, 1024);
        if ($validatedVerifier === null || strlen($validatedVerifier) !== $params['n_pad_length']) {
            error_response('A valid SRP verifier is required.', 422);
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

        try {
            $stmt = db()->prepare('INSERT INTO users (username, srp_salt, srp_verifier) VALUES (:username, :srp_salt, :srp_verifier)');
            $stmt->execute([
                'username' => $username,
                'srp_salt' => $validatedSalt,
                'srp_verifier' => $validatedVerifier,
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

function auth_signin_start(): void
{
    try {
        require_https_request();
        srp_require_runtime();
        start_session_if_needed();

        $body = json_input();

        $username = trim((string)($body['username'] ?? ''));

        if ($username === '' || strlen($username) > 40) {
            error_response('Username is required.', 422);
        }

        try {
            $realUser = auth_load_user_for_signin($username);
        } catch (Throwable $ex) {
            auth_error_response('Unable to start sign in right now.', 500, 'signin.start.lookup_user', $ex);
        }

        $signinUser = $realUser ?? auth_make_fake_signin_user($username);

        $serverState = srp_make_server_public((string)$signinUser['srp_verifier']);

        $ttl = (int)(config()['auth']['srp_challenge_ttl_seconds'] ?? 300);
        $_SESSION[auth_pending_key($username)] = [
            'username' => $username,
            'user_id' => (int)$signinUser['id'],
            'srp_verifier' => (string)$signinUser['srp_verifier'],
            'server_secret' => $serverState['server_secret_hex'],
            'server_public' => $serverState['server_public_hex'],
            'expires_at' => time() + max(30, $ttl),
            'attempts' => 0,
        ];

        success_response([
            'salt' => (string)$signinUser['srp_salt'],
            'server_public' => $serverState['server_public_hex'],
            'username' => (string)$signinUser['username'],
            'params' => [
                'group' => 'rfc5054_2048',
                'hash' => 'sha256',
            ],
        ]);
    } catch (Throwable $ex) {
        auth_error_response('Sign in start failed unexpectedly.', 500, 'signin.start.unexpected', $ex);
    }
}

function auth_signin_finish(): void
{
    try {
        require_https_request();
        start_session_if_needed();

        $body = json_input();

        $username = trim((string)($body['username'] ?? ''));
        $clientPublicHex = (string)($body['client_public'] ?? '');
        $clientProofHex = (string)($body['client_proof'] ?? '');

        if ($username === '') {
            error_response('Username is required.', 422);
        }

        $validatedClientPublic = srp_validate_hex($clientPublicHex, 1024);
        if ($validatedClientPublic === null || strlen($validatedClientPublic) < 64) {
            error_response('Client SRP public key is required.', 422);
        }

        $validatedClientProof = srp_validate_hex($clientProofHex, 128);
        if ($validatedClientProof === null || strlen($validatedClientProof) !== 64) {
            error_response('Client SRP proof is required.', 422);
        }

        $pendingKey = auth_pending_key($username);
        $pending = $_SESSION[$pendingKey] ?? null;
        if (!is_array($pending)) {
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.finish.pending_missing',
            ]);
        }

        if ((int)($pending['expires_at'] ?? 0) < time()) {
            unset($_SESSION[$pendingKey]);
            error_response('Sign in challenge expired. Please retry.', 401, [
                'stage' => 'signin.finish.challenge_expired',
            ]);
        }

        $attempts = (int)($pending['attempts'] ?? 0) + 1;
        $pending['attempts'] = $attempts;
        $_SESSION[$pendingKey] = $pending;
        if ($attempts > 5) {
            unset($_SESSION[$pendingKey]);
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.finish.too_many_attempts',
            ]);
        }

        $params = srp_params();
        $a = srp_hex_to_gmp($validatedClientPublic);
        $n = srp_hex_to_gmp($params['n_hex']);
        if (gmp_cmp(gmp_mod($a, $n), gmp_init(0)) === 0) {
            unset($_SESSION[$pendingKey]);
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.finish.invalid_client_public',
            ]);
        }

        $serverPublicHex = (string)($pending['server_public'] ?? '');
        $serverSecretHex = (string)($pending['server_secret'] ?? '');
        $verifierHex = (string)($pending['srp_verifier'] ?? '');
        if ($serverPublicHex === '' || $serverSecretHex === '' || $verifierHex === '') {
            unset($_SESSION[$pendingKey]);
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.finish.pending_corrupt',
            ]);
        }

        $uHex = srp_compute_u_hex($validatedClientPublic, $serverPublicHex);
        $sessionKeyHex = srp_compute_server_session_key_hex(
            $validatedClientPublic,
            $verifierHex,
            $serverSecretHex,
            $uHex
        );

        $expectedClientProof = srp_compute_client_proof_hex(
            $validatedClientPublic,
            $serverPublicHex,
            $sessionKeyHex
        );
        if ($expectedClientProof === '' || !hash_equals($expectedClientProof, $validatedClientProof)) {
            unset($_SESSION[$pendingKey]);
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.finish.proof_mismatch',
            ]);
        }

        $serverProof = srp_compute_server_proof_hex(
            $validatedClientPublic,
            $expectedClientProof,
            $sessionKeyHex
        );

        $userId = (int)($pending['user_id'] ?? 0);
        unset($_SESSION[$pendingKey]);

        if ($userId <= 0) {
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.finish.unknown_user',
            ]);
        }

        set_user_session($userId);

        try {
            $updateStmt = db()->prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id');
            $updateStmt->execute(['id' => $userId]);
        } catch (Throwable $ex) {
            auth_error_response('Signed in, but failed to record login time.', 500, 'signin.finish.update_last_login', $ex, [
                'user_id' => $userId,
            ]);
        }

        try {
            $userStmt = db()->prepare('SELECT id, username FROM users WHERE id = :id LIMIT 1');
            $userStmt->execute(['id' => $userId]);
            $user = $userStmt->fetch();
        } catch (Throwable $ex) {
            auth_error_response('Signed in, but failed to load user data.', 500, 'signin.finish.load_user', $ex, [
                'user_id' => $userId,
            ]);
        }

        if (!$user) {
            error_response('Invalid credentials.', 401, [
                'stage' => 'signin.finish.user_missing_after_auth',
            ]);
        }

        success_response([
            'user' => [
                'id' => (int)$user['id'],
                'username' => (string)$user['username'],
            ],
            'server_proof' => $serverProof,
        ]);
    } catch (Throwable $ex) {
        auth_error_response('Sign in finish failed unexpectedly.', 500, 'signin.finish.unexpected', $ex);
    }
}

function auth_signout(): void
{
    try {
        require_https_request();
        clear_user_session();
        success_response(['message' => 'Signed out.']);
    } catch (Throwable $ex) {
        auth_error_response('Failed to sign out cleanly.', 500, 'signout.clear_session', $ex);
    }
}

function auth_me(): void
{
    try {
        require_https_request();
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
    require_https_request();

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
            'srp_runtime' => [
                'gmp_loaded' => extension_loaded('gmp'),
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
            'https' => request_is_https(),
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

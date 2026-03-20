<?php

declare(strict_types=1);

function srp_params(): array
{
    static $params = null;
    if ($params !== null) {
        return $params;
    }

    $nHex = strtoupper(
        'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050'
        . 'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50'
        . 'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8'
        . '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B'
        . 'CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748'
        . '544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6'
        . 'AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6'
        . '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73'
    );

    $gHex = '02';
    $nPadLength = strlen($nHex);
    $kHex = srp_hash_hex([srp_pad_hex($nHex, $nPadLength), srp_pad_hex($gHex, $nPadLength)]);

    $params = [
        'n_hex' => $nHex,
        'g_hex' => $gHex,
        'k_hex' => $kHex,
        'n_pad_length' => $nPadLength,
    ];

    return $params;
}

function srp_require_runtime(): void
{
    if (!extension_loaded('gmp')) {
        error_response('Server SRP runtime is not available (missing GMP extension).', 500);
    }
}

function srp_validate_hex(string $value, int $maxLen): ?string
{
    $hex = strtolower(trim($value));
    if ($hex === '' || strlen($hex) > $maxLen || (strlen($hex) % 2) !== 0) {
        return null;
    }

    if (!preg_match('/^[0-9a-f]+$/', $hex)) {
        return null;
    }

    return $hex;
}

function srp_random_secret_hex(int $bytes = 32): string
{
    return bin2hex(random_bytes($bytes));
}

function srp_hash_hex(array $hexParts): string
{
    $binary = '';
    foreach ($hexParts as $part) {
        $partHex = strtolower(trim((string)$part));
        if ($partHex === '') {
            continue;
        }

        if ((strlen($partHex) % 2) !== 0) {
            $partHex = '0' . $partHex;
        }

        $chunk = hex2bin($partHex);
        if ($chunk === false) {
            throw new RuntimeException('Invalid hex input for hash.');
        }

        $binary .= $chunk;
    }

    return hash('sha256', $binary);
}

function srp_hash_string_hex(string $value): string
{
    return hash('sha256', $value);
}

function srp_pad_hex(string $hex, int $targetLength): string
{
    $normalized = strtolower(ltrim($hex, '0'));
    if ($normalized === '') {
        $normalized = '0';
    }
    if ((strlen($normalized) % 2) !== 0) {
        $normalized = '0' . $normalized;
    }

    return str_pad($normalized, $targetLength, '0', STR_PAD_LEFT);
}

function srp_hex_to_gmp(string $hex): GMP
{
    $clean = strtolower(ltrim($hex, '0'));
    if ($clean === '') {
        $clean = '0';
    }

    return gmp_init($clean, 16);
}

function srp_gmp_to_hex(GMP $value): string
{
    $hex = gmp_strval($value, 16);
    if ((strlen($hex) % 2) !== 0) {
        $hex = '0' . $hex;
    }

    return strtolower($hex);
}

function srp_user_x_hex(string $username, string $password, string $saltHex): string
{
    $identityHex = srp_hash_string_hex($username . ':' . $password);
    return srp_hash_hex([$saltHex, $identityHex]);
}

function srp_make_verifier_hex(string $xHex): string
{
    $params = srp_params();
    $n = srp_hex_to_gmp($params['n_hex']);
    $g = srp_hex_to_gmp($params['g_hex']);
    $x = srp_hex_to_gmp($xHex);

    return srp_gmp_to_hex(gmp_powm($g, $x, $n));
}

function srp_make_server_public(string $verifierHex): array
{
    $params = srp_params();
    $n = srp_hex_to_gmp($params['n_hex']);
    $g = srp_hex_to_gmp($params['g_hex']);
    $k = srp_hex_to_gmp($params['k_hex']);
    $v = srp_hex_to_gmp($verifierHex);

    $bHex = srp_random_secret_hex(32);
    $b = srp_hex_to_gmp($bHex);

    $gb = gmp_powm($g, $b, $n);
    $kv = gmp_mod(gmp_mul($k, $v), $n);
    $bPub = gmp_mod(gmp_add($kv, $gb), $n);

    return [
        'server_secret_hex' => srp_gmp_to_hex($b),
        'server_public_hex' => srp_pad_hex(srp_gmp_to_hex($bPub), $params['n_pad_length']),
    ];
}

function srp_compute_u_hex(string $aHex, string $bHex): string
{
    $params = srp_params();
    return srp_hash_hex([
        srp_pad_hex($aHex, $params['n_pad_length']),
        srp_pad_hex($bHex, $params['n_pad_length']),
    ]);
}

function srp_compute_server_session_key_hex(string $aHex, string $vHex, string $bHex, string $uHex): string
{
    $params = srp_params();
    $n = srp_hex_to_gmp($params['n_hex']);

    $a = srp_hex_to_gmp($aHex);
    $v = srp_hex_to_gmp($vHex);
    $b = srp_hex_to_gmp($bHex);
    $u = srp_hex_to_gmp($uHex);

    $vu = gmp_powm($v, $u, $n);
    $avu = gmp_mod(gmp_mul($a, $vu), $n);
    $s = gmp_powm($avu, $b, $n);

    return srp_hash_hex([srp_pad_hex(srp_gmp_to_hex($s), $params['n_pad_length'])]);
}

function srp_compute_client_proof_hex(string $aHex, string $bHex, string $keyHex): string
{
    $params = srp_params();
    return srp_hash_hex([
        srp_pad_hex($aHex, $params['n_pad_length']),
        srp_pad_hex($bHex, $params['n_pad_length']),
        $keyHex,
    ]);
}

function srp_compute_server_proof_hex(string $aHex, string $clientProofHex, string $keyHex): string
{
    $params = srp_params();
    return srp_hash_hex([
        srp_pad_hex($aHex, $params['n_pad_length']),
        $clientProofHex,
        $keyHex,
    ]);
}

const { webcrypto } = require('crypto');

const SRP_GROUP_2048_N_HEX = (
  'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050'
  + 'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50'
  + 'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8'
  + '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B'
  + 'CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748'
  + '544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6'
  + 'AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6'
  + '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73'
).toLowerCase();

const SRP_GROUP_2048_G_HEX = '02';
const encoder = new TextEncoder();

function normalizeHex(hex) {
  const value = (hex || '').toLowerCase();
  if (!/^[0-9a-f]*$/.test(value)) {
    throw new Error('Invalid hex input.');
  }
  return value.length % 2 === 0 ? value : '0' + value;
}

function padHex(hex, targetLength) {
  const normalized = normalizeHex(hex).replace(/^0+/, '') || '00';
  return normalized.padStart(targetLength, '0');
}

function hexToBytes(hex) {
  const normalized = normalizeHex(hex);
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBigInt(hex) {
  const normalized = normalizeHex(hex).replace(/^0+/, '');
  return BigInt('0x' + (normalized || '0'));
}

function bigIntToHex(value) {
  const hex = value.toString(16);
  return hex.length % 2 === 0 ? hex : '0' + hex;
}

function mod(n, m) {
  const out = n % m;
  return out >= 0n ? out : out + m;
}

function modPow(base, exponent, modulus) {
  if (modulus === 1n) {
    return 0n;
  }

  let result = 1n;
  let nextBase = mod(base, modulus);
  let nextExponent = exponent;

  while (nextExponent > 0n) {
    if ((nextExponent & 1n) === 1n) {
      result = mod(result * nextBase, modulus);
    }
    nextExponent >>= 1n;
    nextBase = mod(nextBase * nextBase, modulus);
  }

  return result;
}

async function sha256Bytes(bytes) {
  const digest = await webcrypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

async function hashHexConcat(hexParts) {
  const total = hexParts
    .map((part) => hexToBytes(part))
    .reduce((acc, bytes) => {
      const joined = new Uint8Array(acc.length + bytes.length);
      joined.set(acc);
      joined.set(bytes, acc.length);
      return joined;
    }, new Uint8Array(0));

  return bytesToHex(await sha256Bytes(total));
}

async function hashStringToHex(value) {
  return bytesToHex(await sha256Bytes(encoder.encode(value)));
}

function randomHex(size) {
  const bytes = new Uint8Array(size);
  webcrypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function srpParams() {
  const nHex = SRP_GROUP_2048_N_HEX;
  return {
    nHex,
    gHex: SRP_GROUP_2048_G_HEX,
    nPadLength: nHex.length,
  };
}

async function deriveXHex(username, password, saltHex) {
  const identityHex = await hashStringToHex(username + ':' + password);
  return hashHexConcat([saltHex, identityHex]);
}

async function buildSignupPayload(username, password) {
  const params = srpParams();
  const n = hexToBigInt(params.nHex);
  const g = hexToBigInt(params.gHex);
  const saltHex = randomHex(32);
  const xHex = await deriveXHex(username, password, saltHex);
  const verifier = modPow(g, hexToBigInt(xHex), n);

  return {
    username,
    salt: saltHex,
    verifier: padHex(bigIntToHex(verifier), params.nPadLength),
  };
}

async function startClientHandshake(username, password, serverResponse) {
  const params = srpParams();
  const n = hexToBigInt(params.nHex);
  const g = hexToBigInt(params.gHex);
  const kHex = await hashHexConcat([
    padHex(params.nHex, params.nPadLength),
    padHex(params.gHex, params.nPadLength),
  ]);
  const k = hexToBigInt(kHex);

  const aHex = randomHex(32);
  const a = hexToBigInt(aHex);
  const aPublic = modPow(g, a, n);
  const aPublicHex = padHex(bigIntToHex(aPublic), params.nPadLength);
  const saltHex = normalizeHex(serverResponse.salt || '');
  const bPublicHex = normalizeHex(serverResponse.server_public || '');

  const uHex = await hashHexConcat([
    padHex(aPublicHex, params.nPadLength),
    padHex(bPublicHex, params.nPadLength),
  ]);
  const u = hexToBigInt(uHex);
  const xHex = await deriveXHex(username, password, saltHex);
  const x = hexToBigInt(xHex);
  const gPowX = modPow(g, x, n);
  const kgx = mod(k * gPowX, n);
  const base = mod(hexToBigInt(bPublicHex) - kgx, n);
  const exponent = a + u * x;
  const sessionSecret = modPow(base, exponent, n);
  const sessionKeyHex = await hashHexConcat([padHex(bigIntToHex(sessionSecret), params.nPadLength)]);

  const clientProof = await hashHexConcat([
    padHex(aPublicHex, params.nPadLength),
    padHex(bPublicHex, params.nPadLength),
    sessionKeyHex,
  ]);

  const expectedServerProof = await hashHexConcat([
    padHex(aPublicHex, params.nPadLength),
    clientProof,
    sessionKeyHex,
  ]);

  return {
    clientPublic: aPublicHex,
    clientProof,
    expectedServerProof,
  };
}

module.exports = {
  buildSignupPayload,
  startClientHandshake,
};
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getServerInfo } = require('./server-runtime');

function resolvePhpBin(rootDir) {
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  if (process.env.PARTY_PHP_BIN) {
    return process.env.PARTY_PHP_BIN;
  }

  return fs.existsSync(bundledPhp) ? bundledPhp : 'php';
}

function setUserAdmin(username, isAdmin = true) {
  const { rootDir, sqlitePath } = getServerInfo();
  const phpBin = resolvePhpBin(rootDir);
  const phpScript = [
    '$db = new PDO("sqlite:" . $argv[1]);',
    '$stmt = $db->prepare("UPDATE users SET is_admin = :is_admin WHERE username = :username");',
    '$stmt->bindValue(":is_admin", (int)$argv[3], PDO::PARAM_INT);',
    '$stmt->bindValue(":username", $argv[2], PDO::PARAM_STR);',
    '$stmt->execute();',
    'if ($stmt->rowCount() < 1) { fwrite(STDERR, "No user updated.\n"); exit(1); }',
  ].join(' ');

  const result = spawnSync(phpBin, ['-r', phpScript, sqlitePath, username, isAdmin ? '1' : '0'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`Failed to update admin state for ${username}: ${stderr || `exit ${result.status}`}`);
  }
}

module.exports = {
  setUserAdmin,
};
const fs = require('fs');
const path = require('path');

const artifactRoot = path.join(__dirname, '..', '..', '.tmp', 'e2e', 'artifacts');

function ensureArtifactRoot() {
  fs.mkdirSync(artifactRoot, { recursive: true });
}

function storageStatePath(name) {
  ensureArtifactRoot();
  return path.join(artifactRoot, `${name}.storage.json`);
}

function credentialsPath(name) {
  ensureArtifactRoot();
  return path.join(artifactRoot, `${name}.credentials.json`);
}

function writeCredentials(name, credentials) {
  fs.writeFileSync(credentialsPath(name), JSON.stringify(credentials, null, 2));
}

function readCredentials(name) {
  return JSON.parse(fs.readFileSync(credentialsPath(name), 'utf8'));
}

module.exports = {
  artifactRoot,
  credentialsPath,
  ensureArtifactRoot,
  readCredentials,
  storageStatePath,
  writeCredentials,
};
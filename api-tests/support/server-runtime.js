const { spawn } = require('child_process');
const { prepareDisposableServerEnv } = require('../../server/test-env');

let serverProcess = null;
let serverInfo = null;
let serverOutput = '';

function captureOutput(stream, prefix) {
  if (!stream) {
    return;
  }

  stream.on('data', (chunk) => {
    serverOutput += `[${prefix}] ${String(chunk)}`;
  });
}

async function waitForApi(baseURL, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for API at ${baseURL}/api\n${serverOutput}`.trim());
}

async function startTestServer() {
  if (serverProcess) {
    return serverInfo;
  }

  serverInfo = prepareDisposableServerEnv({
    scope: 'api-tests',
    publicPort: process.env.PARTY_API_TEST_PORT || '3300',
    phpPort: process.env.PARTY_API_TEST_PHP_PORT || '3301',
  });
  serverOutput = '';

  serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: serverInfo.rootDir,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  captureOutput(serverProcess.stdout, 'server');
  captureOutput(serverProcess.stderr, 'server');

  serverProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      serverOutput += `\n[server] exited with code ${code}`;
    }
    serverProcess = null;
  });

  await waitForApi(serverInfo.baseURL);
  return serverInfo;
}

async function stopTestServer() {
  if (!serverProcess) {
    return;
  }

  const processToStop = serverProcess;
  serverProcess = null;

  await new Promise((resolve) => {
    let settled = false;
    const finalize = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(forceKillTimer);
      resolve();
    };

    processToStop.once('exit', finalize);
    processToStop.kill('SIGTERM');
    const forceKillTimer = setTimeout(() => {
      if (!processToStop.killed) {
        processToStop.kill('SIGKILL');
      }
      finalize();
    }, 5000);
    forceKillTimer.unref();
  });
}

function getServerInfo() {
  if (!serverInfo) {
    throw new Error('Test server has not been started.');
  }

  return serverInfo;
}

module.exports = {
  getServerInfo,
  startTestServer,
  stopTestServer,
};
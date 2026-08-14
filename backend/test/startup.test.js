import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

import { MongoMemoryServer } from 'mongodb-memory-server';

const reservePort = async () => {
  const probe = net.createServer();

  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });

  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));

  return port;
};

const waitForStartup = async (child, output, port) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Server exited before startup with code ${child.exitCode}: ${output()}`
      );
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/live`
      );
      if (response.status === 200) {
        return;
      }
    }
    catch {
      // The socket is expected to refuse connections until listen() runs.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server startup timed out: ${output()}`);
};

test('server.js starts against isolated MongoDB and serves health', async () => {
  const mongo = await MongoMemoryServer.create();
  const port = await reservePort();
  let stdout = '';
  let stderr = '';

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      MONGO_URI: mongo.getUri('dental_clinic_test'),
      JWT_SECRET: 'test-only-secret-that-is-at-least-thirty-two-characters',
      JWT_EXPIRES_IN: '15m',
      CLIENT_URL: 'http://localhost:5173',
      CLINIC_TIMEZONE: 'Asia/Yerevan',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    await waitForStartup(child, () => `${stdout}\n${stderr}`, port);

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);

    const readiness = await fetch(
      `http://127.0.0.1:${port}/api/v1/health/ready`
    );
    assert.equal(readiness.status, 200);
  }
  finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }

    await mongo.stop();
  }
});

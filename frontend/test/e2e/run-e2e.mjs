import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const host = "127.0.0.1";
const frontendPort = 3100;
const mockApiPort = 5100;
const startupTimeoutMs = 180_000;
const projectRoot = path.resolve(process.cwd());
const distDir = ".next-e2e";
const distPath = path.resolve(projectRoot, distDir);

if (path.dirname(distPath) !== projectRoot || path.basename(distPath) !== ".next-e2e") {
  throw new Error("Refusing to use an E2E cache directory outside the frontend project.");
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => reject(new Error(`Test port ${port} is unavailable: ${error.message}`)));
    server.listen(port, host, () => server.close(resolve));
  });
}

async function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", unavailable);
    socket.once("timeout", unavailable);
  });
}

async function waitForFrontend(child) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (exit code ${child.exitCode}).`);
    }
    if (await canConnect(frontendPort)) return;
    await delay(250);
  }
  throw new Error(`Next.js did not listen on ${host}:${frontendPort} within ${startupTimeoutMs}ms.`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;

  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const killerExitCode = await new Promise((resolve) => {
      killer.once("error", () => resolve(1));
      killer.once("exit", (code) => resolve(code ?? 1));
    });
    if (killerExitCode !== 0) child.kill();
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    return;
  }
  if (!(await waitForExit(child, 5_000))) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // The process tree exited between checks.
    }
  }
}

await Promise.all([
  assertPortAvailable(frontendPort),
  assertPortAvailable(mockApiPort),
  rm(distPath, { force: true, maxRetries: 3, recursive: true, retryDelay: 250 }),
]);

const nextProcess = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", host, "--port", String(frontendPort)],
  {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: `http://${host}:${mockApiPort}/api/v1`,
      NEXT_PUBLIC_SITE_URL: `http://${host}:${frontendPort}`,
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "",
      NEXT_DIST_DIR: distDir,
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  },
);

let playwrightProcess;
let cleanupPromise;
const cleanup = () => {
  cleanupPromise ??= (async () => {
    await stopProcessTree(playwrightProcess);
    await stopProcessTree(nextProcess);
    await rm(distPath, { force: true, maxRetries: 3, recursive: true, retryDelay: 250 });
  })();
  return cleanupPromise;
};

for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(exitCode));
  });
}

let exitCode = 1;
try {
  await waitForFrontend(nextProcess);
  playwrightProcess = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      env: process.env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  exitCode = await new Promise((resolve, reject) => {
    playwrightProcess.once("error", reject);
    playwrightProcess.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
} finally {
  await cleanup();
}

process.exitCode = exitCode;

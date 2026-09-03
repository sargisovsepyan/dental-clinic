import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { createMockApiServer } from "../e2e/mock-api.mjs";

const host = "127.0.0.1";
const frontendPort = 3000;
const apiPort = 5000;
const distDir = ".next-preview";
const projectRoot = path.resolve(process.cwd());
const distPath = path.resolve(projectRoot, distDir);
const scenarioArg = process.argv.find((value) => value.startsWith("--scenario="));
const initialScenario = scenarioArg?.slice("--scenario=".length) || "success";

if (path.dirname(distPath) !== projectRoot || path.basename(distPath) !== distDir) {
  throw new Error("Refusing to use a preview cache directory outside the frontend project.");
}

const assertPortAvailable = (port) => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", (error) => reject(new Error(`Preview port ${port} is unavailable: ${error.message}`)));
  server.listen(port, host, () => server.close(resolve));
});

const stopProcessTree = async (child) => {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      killer.once("error", resolve);
      killer.once("exit", resolve);
    });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
};

await Promise.all([
  assertPortAvailable(frontendPort),
  assertPortAvailable(apiPort),
  rm(distPath, { force: true, maxRetries: 3, recursive: true, retryDelay: 250 }),
]);

const api = createMockApiServer(apiPort, initialScenario);
await new Promise((resolve, reject) => {
  api.once("error", reject);
  api.listen(apiPort, host, resolve);
});

const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", host, "--port", String(frontendPort)], {
  cwd: projectRoot,
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: `http://${host}:${apiPort}/api/v1`,
    NEXT_PUBLIC_SITE_URL: `http://${host}:${frontendPort}`,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "",
    NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER: "disabled",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    NEXT_DIST_DIR: distDir,
  },
  shell: false,
  stdio: ["ignore", "inherit", "inherit"],
  windowsHide: true,
});

let cleaning;
const cleanup = () => {
  cleaning ??= (async () => {
    await stopProcessTree(next);
    api.closeAllConnections();
    await new Promise((resolve) => api.close(resolve));
    await rm(distPath, { force: true, maxRetries: 3, recursive: true, retryDelay: 250 });
  })();
  return cleaning;
};

console.log(`Preview site: http://${host}:${frontendPort}/hy`);
console.log(`Booking flow: http://${host}:${frontendPort}/hy/book`);
console.log(`Mock API: http://${host}:${apiPort}/api/v1 (scenario: ${initialScenario})`);
console.log("Switch scenarios without editing source: open http://127.0.0.1:5000/__test__/scenario/confirmed then refresh the booking page.");

let shutdownRequested = false;
const requestShutdown = (exitCode) => {
  if (shutdownRequested) return;
  shutdownRequested = true;
  void cleanup().finally(() => process.exit(exitCode));
};

for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => requestShutdown(exitCode));
}

// Some integrated Windows terminals forward Ctrl+C as ETX on stdin instead of
// raising SIGINT. Keep the launcher, rather than Next.js, as the sole stdin
// owner so both terminal behaviors run the same bounded cleanup.
process.stdin.resume();
process.stdin.on("data", (chunk) => {
  if (chunk.includes(3)) requestShutdown(130);
});

const exitCode = await new Promise((resolve) => {
  next.once("error", () => resolve(1));
  next.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
});
await cleanup();
process.exitCode = exitCode;

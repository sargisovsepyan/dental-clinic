import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));
const backendRoot = fileURLToPath(new URL("../../../backend/", import.meta.url));
const requireBackend = createRequire(new URL("../../../backend/package.json", import.meta.url));
const { MongoMemoryReplSet } = requireBackend("mongodb-memory-server");
const site = "https://clinic.example.test";
const children = [];
let mongo;
let browser;
let context;
let cleanupPromise;

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function launch(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.on("error", () => {});
  children.push(child);
  return { child, output: () => output };
}

async function waitReady(process, url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (process.child.exitCode !== null) throw new Error(`Smoke child failed: ${process.output()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch { /* Startup socket not ready yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Smoke startup timed out: ${process.output()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  if (child.smokeApi && process.platform === "win32") child.send("isolated-smoke-shutdown");
  else child.kill("SIGTERM");
  let timer;
  try {
    await Promise.race([exited, new Promise((_, reject) => {
      timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Smoke shutdown timed out")); }, 20000);
    })]);
  } finally { clearTimeout(timer); }
}

async function cleanup() {
  cleanupPromise ??= (async () => {
    // Close routing deliberately before browser disposal; pending Next prefetches
    // must not turn teardown into an unhandled route callback rejection.
    await context?.unrouteAll({ behavior: "ignoreErrors" });
    await browser?.close();
    const results = await Promise.allSettled(children.map(stop));
    await mongo?.stop();
    if (results.some(({ status }) => status === "rejected")) throw new Error("Smoke cleanup failed");
  })();
  return cleanupPromise;
}
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
}

try {
  const apiPort = await availablePort();
  const webPort = await availablePort();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const api = launch(["test-support/productionSmokeApi.js"], backendRoot, {
    ...process.env, NODE_ENV: "test", PORT: String(apiPort), MONGO_URI: mongo.getUri("dental_clinic_test"),
    JWT_SECRET: "test-only-secret-that-is-at-least-thirty-two-characters", API_REPLICA_COUNT: "1",
    CLIENT_URL: site, FRONTEND_URL: site, CORS_ORIGINS: site,
    REQUIRE_HTTPS: "false", TRUST_PROXY_HOPS: "0", TRUST_PROXY_CIDRS: "",
    REFRESH_COOKIE_SECURE: "true", REFRESH_COOKIE_SAME_SITE: "strict", REFRESH_COOKIE_DOMAIN: "",
    NOTIFICATIONS_ENABLED: "false", RATE_LIMIT_STORE: "memory", PUBLIC_BOOKING_CHALLENGE_PROVIDER: "disabled",
    CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "",
    SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM: "", ERROR_MONITOR_WEBHOOK_URL: "",
  });
  const apiBase = `http://127.0.0.1:${apiPort}`;
  api.child.smokeApi = true;
  await waitReady(api, `${apiBase}/api/v1/health/ready`);
  assert.equal((await fetch(`${apiBase}/api/v1/health/live`)).status, 200);
  const web = launch(["--import", "./test/production/isolate-fetch.mjs", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(webPort)], frontendRoot, {
    ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: ".next",
    NEXT_PUBLIC_API_URL: `${site}/api/v1`, NEXT_PUBLIC_SITE_URL: site,
    NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER: "turnstile", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-config-only-key",
    PRODUCTION_SMOKE_ISOLATED: "true", SMOKE_API_UPSTREAM: `${apiBase}/`,
  });
  const webBase = `http://127.0.0.1:${webPort}`;
  const home = await waitReady(web, `${webBase}/en`);
  assert.match(home.headers.get("content-security-policy"), /upgrade-insecure-requests/);
  browser = await chromium.launch();
  context = await browser.newContext();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== site) return route.abort("blockedbyclient");
    const fixed = url.pathname.startsWith("/api/v1/") ? apiBase : webBase;
    const response = await route.fetch({ url: `${fixed}${url.pathname}${url.search}`, maxRetries: 0, timeout: 10000 });
    return route.fulfill({ response });
  });
  const page = await context.newPage();
  await page.goto(`${site}/en`);
  await page.getByRole("link", { name: "Book a visit" }).first().waitFor();
  await page.goto(`${site}/en/staff/login`);
  await page.getByLabel("Email address").fill("admin@example.com");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${site}/en/staff`);
  const cookie = (await context.cookies()).find(({ name }) => name === "refresh_token");
  assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Strict");
  assert.equal(cookie.path, "/api/v1/auth");
  await page.reload();
  await page.getByText("Admin User", { exact: true }).first().waitFor();
  await page.goto(`${site}/en/staff/appointments`);
  await page.getByRole("heading", { name: "Appointment workspace", exact: true }).waitFor();
  await page.getByRole("button", { name: /Sign out|Log out/ }).click();
  await page.waitForURL(/\/staff\/login/);
  assert.equal((await context.cookies()).some(({ name }) => name === "refresh_token"), false);

  // Turnstile is intentionally blocked, so exercise synthetic booking through
  // the same-origin browser API boundary, without pretending to verify a real key.
  const result = await page.evaluate(async () => {
    const get = async (path) => (await (await fetch(`/api/v1/${path}`)).json()).data;
    const [{ dentists }, { services }] = await Promise.all([get("dentists"), get("services")]);
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dentistId = dentists[0]._id;
    const serviceId = services[0]._id;
    const { availability } = await get(`availability?dentistId=${dentistId}&serviceId=${serviceId}&date=${date}`);
    const response = await fetch("/api/v1/appointments", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({
      patientName: "Synthetic Smoke", patientPhone: "+37499123456", dentistId, serviceId, date,
      startTime: availability.slots[0].start, locale: "hy", privacyAccepted: true,
    }) });
    return { status: response.status, success: (await response.json()).success };
  });
  assert.deepEqual(result, { status: 201, success: true });
  await page.goto(`${site}/hy/book`);
  await page.getByRole("button", { name: /Պրոֆեսիոնալ մաքրում/ }).waitFor();
  await cleanup();
  assert.equal(api.child.exitCode, 0, "API graceful shutdown must succeed");
  for (const port of [apiPort, webPort]) {
    const server = net.createServer();
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("Production-build smoke passed: real isolated API, health, SSR, secure auth/refresh/logout, admin, booking, shutdown, ports released. No providers contacted; build artifact retained.");
} catch (error) {
  await cleanup();
  throw error;
}

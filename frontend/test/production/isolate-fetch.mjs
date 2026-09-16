// Test preload, not application routing. Redirect ONLY a synthetic fixture API.
// Everything else must be loopback; no DNS/provider/monitoring contact is allowed.
if (process.env.PRODUCTION_SMOKE_ISOLATED !== "true") throw new Error("Isolated smoke preload only");
const upstream = new URL(process.env.SMOKE_API_UPSTREAM);
if (upstream.protocol !== "http:" || upstream.hostname !== "127.0.0.1" || upstream.pathname !== "/") {
  throw new Error("Smoke upstream must be loopback");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === "https://clinic.example.test" && url.pathname.startsWith("/api/v1/")) {
    const local = new URL(`${url.pathname}${url.search}`, upstream);
    return originalFetch(local, options);
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    return Promise.reject(new Error("External fetch blocked by isolated smoke"));
  }
  return originalFetch(input, options);
};

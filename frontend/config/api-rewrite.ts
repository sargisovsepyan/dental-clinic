type FixedApiRewrite = {
  source: string;
  destination: string;
};

const FIXED_API_ROUTE_SOURCE = "/api/v1/:path*";
const LOCAL_HOST = /^(?:localhost|.*\.localhost|127(?:\.[0-9]{1,3}){3}|0\.0\.0\.0|\[::1?\]|\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\])$/i;

const buildFixedApiRewrites = ({
  rawUpstream,
  production,
  siteOrigin,
}: {
  rawUpstream: string | undefined;
  production: boolean;
  siteOrigin: string;
}): FixedApiRewrite[] => {
  const configured = rawUpstream?.trim();
  if (!configured) {
    if (production) {
      throw new Error("API_UPSTREAM_ORIGIN is required in production");
    }
    return [];
  }
  if (/[\u0000-\u001f\u007f]/u.test(configured)) {
    throw new Error("API_UPSTREAM_ORIGIN must be a safe HTTPS origin");
  }

  let upstream: URL;
  try {
    upstream = new URL(configured);
  } catch {
    throw new Error("API_UPSTREAM_ORIGIN must be an absolute HTTPS origin");
  }

  if (
    upstream.protocol !== "https:" ||
    upstream.username ||
    upstream.password ||
    upstream.search ||
    upstream.hash ||
    upstream.pathname !== "/" ||
    upstream.href !== `${upstream.origin}/` ||
    LOCAL_HOST.test(upstream.hostname)
  ) {
    throw new Error(
      "API_UPSTREAM_ORIGIN must be a non-local HTTPS origin without credentials, path, query, or fragment",
    );
  }
  if (upstream.origin === siteOrigin) {
    throw new Error("API_UPSTREAM_ORIGIN must not point back to the frontend origin");
  }

  return [{
    source: FIXED_API_ROUTE_SOURCE,
    destination: `${upstream.origin}/api/v1/:path*`,
  }];
};

export { FIXED_API_ROUTE_SOURCE, buildFixedApiRewrites };
export type { FixedApiRewrite };

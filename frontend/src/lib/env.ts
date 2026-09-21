import { z } from "zod";

const cloudNameSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^[a-z0-9_-]+$/i.test(value),
    "Cloudinary cloud name contains unsupported characters",
  )
  .optional()
  .transform((value) => value || undefined);

export interface FrontendEnvironment {
  apiBaseUrl: string;
  siteBaseUrl: string;
  cloudinaryCloudName?: string;
  bookingChallenge: {
    provider: "disabled" | "turnstile";
    siteKey?: string;
  };
  previewMode: boolean;
}

export class FrontendConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontendConfigurationError";
  }
}

export function parseApiBaseUrl(raw: string | undefined, production = false) {
  if (!raw) {
    throw new FrontendConfigurationError(
      "NEXT_PUBLIC_API_URL is required and must point to the Express /api/v1 base",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new FrontendConfigurationError("NEXT_PUBLIC_API_URL must be an absolute URL");
  }

  const localHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (production && /^(localhost|.*\.localhost|127\..*|0\.0\.0\.0|\[::1?\]|\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\])$/i.test(parsed.hostname)) {
    throw new FrontendConfigurationError("Production API cannot use localhost");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new FrontendConfigurationError(
      "NEXT_PUBLIC_API_URL cannot contain credentials, a query, or a fragment",
    );
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost && !production)) {
    throw new FrontendConfigurationError(
      "NEXT_PUBLIC_API_URL must use HTTPS outside local development",
    );
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname !== "/api/v1") {
    throw new FrontendConfigurationError("NEXT_PUBLIC_API_URL must end with /api/v1");
  }

  parsed.pathname = pathname;
  return parsed.toString().replace(/\/$/, "");
}

export function parseSiteBaseUrl(raw: string | undefined, production = false) {
  if (!raw) throw new FrontendConfigurationError("NEXT_PUBLIC_SITE_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new FrontendConfigurationError("NEXT_PUBLIC_SITE_URL must be an absolute URL");
  }
  const localHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (production && /^(localhost|.*\.localhost|127\..*|0\.0\.0\.0|\[::1?\]|\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\])$/i.test(parsed.hostname)) {
    throw new FrontendConfigurationError("Production site cannot use localhost");
  }
  if (
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    parsed.pathname.replace(/\/+$/, "") !== "" ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost && !production))
  ) {
    throw new FrontendConfigurationError(
      "NEXT_PUBLIC_SITE_URL must be a credential-free HTTPS origin (HTTP localhost in development)",
    );
  }
  return parsed.origin;
}

export function parseFrontendEnvironment(
  values: {
    NEXT_PUBLIC_API_URL?: string;
    NEXT_PUBLIC_SITE_URL?: string;
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?: string;
    NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER?: string;
    NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
    NEXT_PUBLIC_ARELIS_PREVIEW_MODE?: string;
  },
  production = process.env.NODE_ENV === "production",
): FrontendEnvironment {
  const cloudResult = cloudNameSchema.safeParse(values.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
  if (!cloudResult.success) {
    throw new FrontendConfigurationError(cloudResult.error.issues[0]?.message ?? "Invalid Cloudinary configuration");
  }

  const provider = values.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER?.trim() ||
    (production ? "turnstile" : "disabled");
  if (provider !== "disabled" && provider !== "turnstile") {
    throw new FrontendConfigurationError(
      "NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER must be disabled or turnstile",
    );
  }
  const siteKey = values.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;
  if (provider === "turnstile" && !siteKey) {
    throw new FrontendConfigurationError(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY is required when Turnstile booking protection is enabled",
    );
  }
  if (production && provider !== "turnstile") {
    throw new FrontendConfigurationError(
      "Production public booking requires NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER=turnstile",
    );
  }
  const previewValue = values.NEXT_PUBLIC_ARELIS_PREVIEW_MODE?.trim() || "";
  if (previewValue && previewValue !== "supervised") {
    throw new FrontendConfigurationError(
      "NEXT_PUBLIC_ARELIS_PREVIEW_MODE must be empty or supervised",
    );
  }
  if (production && previewValue) {
    throw new FrontendConfigurationError("Preview mode cannot be enabled in production");
  }

  const apiBaseUrl = parseApiBaseUrl(values.NEXT_PUBLIC_API_URL, production);
  const siteBaseUrl = parseSiteBaseUrl(values.NEXT_PUBLIC_SITE_URL, production);
  if (production && new URL(apiBaseUrl).origin !== siteBaseUrl) {
    throw new FrontendConfigurationError("Production browser API must share the site origin; configure the fixed edge route");
  }
  return {
    apiBaseUrl,
    siteBaseUrl,
    cloudinaryCloudName: cloudResult.data,
    bookingChallenge: { provider, siteKey },
    previewMode: previewValue === "supervised" && !production,
  };
}

export function getFrontendEnvironment() {
  return parseFrontendEnvironment({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER:
      process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_ARELIS_PREVIEW_MODE: process.env.NEXT_PUBLIC_ARELIS_PREVIEW_MODE,
  });
}

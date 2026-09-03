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
  },
  production = process.env.NODE_ENV === "production",
): FrontendEnvironment {
  const cloudResult = cloudNameSchema.safeParse(values.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
  if (!cloudResult.success) {
    throw new FrontendConfigurationError(cloudResult.error.issues[0]?.message ?? "Invalid Cloudinary configuration");
  }

  return {
    apiBaseUrl: parseApiBaseUrl(values.NEXT_PUBLIC_API_URL, production),
    siteBaseUrl: parseSiteBaseUrl(values.NEXT_PUBLIC_SITE_URL, production),
    cloudinaryCloudName: cloudResult.data,
  };
}

export function getFrontendEnvironment() {
  return parseFrontendEnvironment({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  });
}

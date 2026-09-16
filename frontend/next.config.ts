import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const apiValue = process.env.NEXT_PUBLIC_API_URL;
const siteValue = process.env.NEXT_PUBLIC_SITE_URL;
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
const production = process.env.NODE_ENV === "production";
const challengeProvider = process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER?.trim() ||
  (production ? "turnstile" : "disabled");
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

if (!apiValue) {
  throw new Error("NEXT_PUBLIC_API_URL is required; copy .env.example to .env.local for development");
}
if (!siteValue) {
  throw new Error("NEXT_PUBLIC_SITE_URL is required; copy .env.example to .env.local for development");
}

let apiUrl: URL;
let siteUrl: URL;
try {
  apiUrl = new URL(apiValue);
  siteUrl = new URL(siteValue);
} catch {
  throw new Error("Public site/API configuration must use absolute URLs");
}
const isLocalHost = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";
if (apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash || apiUrl.pathname.replace(/\/+$/, "") !== "/api/v1") {
  throw new Error("NEXT_PUBLIC_API_URL must be a credential-free absolute URL ending in /api/v1");
}
if (siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash || siteUrl.pathname.replace(/\/+$/, "") !== "") {
  throw new Error("NEXT_PUBLIC_SITE_URL must be a credential-free origin without a path");
}
if (cloudName && !/^[a-z0-9_-]+$/i.test(cloudName)) {
  throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME contains unsupported characters");
}
if (challengeProvider !== "disabled" && challengeProvider !== "turnstile") {
  throw new Error("NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER must be disabled or turnstile");
}
if (challengeProvider === "turnstile" && !turnstileSiteKey) {
  throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is required when Turnstile is enabled");
}
if (production && challengeProvider !== "turnstile") {
  throw new Error("Production public booking requires Turnstile");
}
if (apiUrl.protocol !== "https:" && !(apiUrl.protocol === "http:" && isLocalHost(apiUrl) && !production)) {
  throw new Error("NEXT_PUBLIC_API_URL must use HTTPS outside local development");
}
if (siteUrl.protocol !== "https:" && !(siteUrl.protocol === "http:" && isLocalHost(siteUrl) && !production)) {
  throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development");
}
if (production && (apiUrl.origin !== siteUrl.origin ||
  /^(localhost|.*\.localhost|127\..*|0\.0\.0\.0|\[::1?\]|\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\])$/i.test(siteUrl.hostname))) {
  throw new Error("Production API must share the non-local HTTPS site origin; configure the fixed edge route");
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: cloudName
      ? [
          {
            protocol: "https",
            hostname: "res.cloudinary.com",
            pathname: `/${cloudName}/image/upload/**`,
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/staff/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:locale(hy|ru|en)/staff/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          production,
          apiOrigin: apiUrl.origin,
          cloudinaryCloudName: cloudName,
          bookingChallengeProvider: challengeProvider,
        }),
      },
    ];
  },
};

export default nextConfig;

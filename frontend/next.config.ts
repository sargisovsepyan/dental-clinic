import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const apiValue = process.env.NEXT_PUBLIC_API_URL;
const siteValue = process.env.NEXT_PUBLIC_SITE_URL;
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
const production = process.env.NODE_ENV === "production";

if (!apiValue) {
  throw new Error("NEXT_PUBLIC_API_URL is required; copy .env.example to .env.local for development");
}
if (!siteValue) {
  throw new Error("NEXT_PUBLIC_SITE_URL is required; copy .env.example to .env.local for development");
}

const apiUrl = new URL(apiValue);
const siteUrl = new URL(siteValue);
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
if (apiUrl.protocol !== "https:" && !(apiUrl.protocol === "http:" && isLocalHost(apiUrl) && !production)) {
  throw new Error("NEXT_PUBLIC_API_URL must use HTTPS outside local development");
}
if (siteUrl.protocol !== "https:" && !(siteUrl.protocol === "http:" && isLocalHost(siteUrl) && !production)) {
  throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development");
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
        source: "/:path*",
        headers: buildSecurityHeaders({
          production,
          apiOrigin: apiUrl.origin,
          cloudinaryCloudName: cloudName,
        }),
      },
    ];
  },
};

export default nextConfig;

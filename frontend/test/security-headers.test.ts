import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "@/lib/security-headers";

const headerMap = (production: boolean) => new Map(
  buildSecurityHeaders({
    production,
    apiOrigin: "https://api.example.test",
    cloudinaryCloudName: "clinic-cloud",
  }).map(({ key, value }) => [key, value]),
);

describe("response security header configuration", () => {
  it("uses the production-only transport policy without development eval", () => {
    const headers = headerMap(true);
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(headers.get("Content-Security-Policy")).toContain("upgrade-insecure-requests");
    expect(headers.get("Content-Security-Policy")).not.toContain("unsafe-eval");
  });

  it("keeps development tooling scoped out of the production policy", () => {
    const headers = headerMap(false);
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("Content-Security-Policy")).toContain("'unsafe-eval'");
    expect(headers.get("Content-Security-Policy")).toContain("https://res.cloudinary.com/clinic-cloud/");
    expect(headers.get("Content-Security-Policy")).not.toContain("upgrade-insecure-requests");
  });

  it("allows Turnstile origins only when that provider is enabled", () => {
    const disabled = headerMap(false).get("Content-Security-Policy");
    const enabled = new Map(buildSecurityHeaders({
      production: true,
      apiOrigin: "https://api.example.test",
      bookingChallengeProvider: "turnstile",
    }).map(({ key, value }) => [key, value])).get("Content-Security-Policy");
    expect(disabled).not.toContain("challenges.cloudflare.com");
    expect(enabled).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(enabled).toContain("frame-src 'self' https://challenges.cloudflare.com");
    expect(enabled).toContain("connect-src 'self' https://api.example.test https://challenges.cloudflare.com");
  });
});

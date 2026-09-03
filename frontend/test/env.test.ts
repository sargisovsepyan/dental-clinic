import { describe, expect, it } from "vitest";
import {
  FrontendConfigurationError,
  parseApiBaseUrl,
  parseFrontendEnvironment,
  parseSiteBaseUrl,
} from "@/lib/env";

describe("frontend environment validation", () => {
  it("accepts exact local development origins", () => {
    expect(parseApiBaseUrl("http://localhost:5000/api/v1", false)).toBe("http://localhost:5000/api/v1");
    expect(parseSiteBaseUrl("http://127.0.0.1:3000", false)).toBe("http://127.0.0.1:3000");
  });

  it.each([
    "https://user:pass@example.com/api/v1",
    "https://example.com/api/v2",
    "https://example.com/api/v1?secret=value",
    "javascript:alert(1)",
  ])("rejects an unsafe API base: %s", (value) => {
    expect(() => parseApiBaseUrl(value, true)).toThrow(FrontendConfigurationError);
  });

  it("requires HTTPS outside local development", () => {
    expect(() => parseApiBaseUrl("http://example.com/api/v1", true)).toThrow(/HTTPS/);
    expect(() => parseSiteBaseUrl("http://example.com", true)).toThrow(/HTTPS/);
  });

  it("validates public Cloudinary configuration without treating it as a secret", () => {
    expect(parseFrontendEnvironment({
      NEXT_PUBLIC_API_URL: "https://api.example.com/api/v1",
      NEXT_PUBLIC_SITE_URL: "https://clinic.example.com",
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "clinic_assets-1",
    }, true).cloudinaryCloudName).toBe("clinic_assets-1");
    expect(() => parseFrontendEnvironment({
      NEXT_PUBLIC_API_URL: "https://api.example.com/api/v1",
      NEXT_PUBLIC_SITE_URL: "https://clinic.example.com",
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "bad/name",
    }, true)).toThrow(/unsupported/);
  });
});

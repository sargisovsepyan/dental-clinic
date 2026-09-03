import { describe, expect, it } from "vitest";
import {
  safeEmailHref,
  safeExternalUrl,
  safeManagedImage,
  safePhoneHref,
  safeSocialUrl,
} from "@/lib/safe-urls";

const image = {
  publicId: "clinic/service",
  secureUrl: "https://res.cloudinary.com/clinic-cloud/image/upload/v1/clinic/service.webp",
  width: 1200,
  height: 800,
  format: "webp",
  bytes: 120000,
};

describe("safe public URL handling", () => {
  it("accepts only the configured Cloudinary image path", () => {
    expect(safeManagedImage(image, "clinic-cloud")?.src).toBe(image.secureUrl);
    expect(safeManagedImage({ ...image, secureUrl: "https://evil.example/image.webp" }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, secureUrl: "https://res.cloudinary.com/other/image/upload/a.webp" }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, secureUrl: `${image.secureUrl}?token=unexpected` }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, secureUrl: `${image.secureUrl}#fragment` }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, secureUrl: "https://res.cloudinary.com:444/clinic-cloud/image/upload/v1/clinic/service.webp" }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, publicId: "clinic/other" }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, publicId: "../service" }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, format: "svg" }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage({ ...image, format: undefined as unknown as string }, "clinic-cloud")).toBeNull();
    expect(safeManagedImage(image, undefined)).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com/path",
    "https://user:pass@example.com/path",
  ])("rejects unsafe external URLs: %s", (value) => {
    expect(safeExternalUrl(value)).toBeNull();
  });

  it("pins social links to the backend host allowlist", () => {
    expect(safeSocialUrl("instagram", "https://www.instagram.com/clinic")).toContain("instagram.com");
    expect(safeSocialUrl("instagram", "https://instagram.com.evil.test/clinic")).toBeNull();
    expect(safeSocialUrl("telegram", "https://t.me/clinic")).toContain("t.me");
  });

  it("constructs conservative contact links", () => {
    expect(safePhoneHref("+374 10 12-34-56")).toBe("tel:+37410123456");
    expect(safePhoneHref("+374<script>")).toBeNull();
    expect(safeEmailHref("CLINIC@example.com")).toBe("mailto:clinic@example.com");
    expect(safeEmailHref("clinic@example.com\r\nBcc:test@example.com")).toBeNull();
  });
});

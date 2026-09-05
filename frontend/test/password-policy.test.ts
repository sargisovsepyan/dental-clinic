import { describe, expect, it } from "vitest";
import { passwordByteLength, passwordCharacterLength, validateNewPassword } from "@/lib/password-policy";

describe("staff password policy", () => {
  it("matches the backend's exact Unicode character minimum", () => {
    expect(passwordCharacterLength("😀😀😀😀😀😀")).toBe(6);
    expect(validateNewPassword("12345")).toBe("too-short");
    expect(validateNewPassword("123456")).toBeNull();
  });

  it("rejects bcrypt-truncating values by UTF-8 byte length without trimming", () => {
    expect(passwordByteLength("ա".repeat(36))).toBe(72);
    expect(validateNewPassword("ա".repeat(36))).toBeNull();
    expect(validateNewPassword("ա".repeat(37))).toBe("too-long");
    expect(validateNewPassword("      ")).toBeNull();
  });
});

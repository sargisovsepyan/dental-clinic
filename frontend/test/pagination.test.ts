import { describe, expect, it } from "vitest";
import { parsePublicPage } from "@/lib/pagination";

describe("public pagination", () => {
  it("defaults an omitted page and accepts canonical positive integers", () => {
    expect(parsePublicPage(undefined)).toBe(1);
    expect(parsePublicPage("1")).toBe(1);
    expect(parsePublicPage("42")).toBe(42);
  });

  it.each(["", "0", "01", "-1", "1.5", "10000000"])(
    "rejects a non-canonical or excessive page: %s",
    (value) => expect(parsePublicPage(value)).toBeNull(),
  );

  it("rejects repeated page parameters", () => {
    expect(parsePublicPage(["1", "2"])).toBeNull();
  });
});

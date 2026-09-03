import { describe, expect, it } from "vitest";
import { isLocale, localizedPath, switchLocalePath } from "@/i18n/locales";
import { selectLocalizedField } from "@/i18n/localized-content";

describe("locale routing", () => {
  it("supports only HY, RU, and EN", () => {
    expect(["hy", "ru", "en"].every(isLocale)).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("preserves the logical path when switching locale", () => {
    expect(switchLocalePath("/ru/services/implantacia", "en")).toBe("/en/services/implantacia");
    expect(switchLocalePath("/", "hy")).toBe("/hy");
    expect(switchLocalePath("/unsupported/path", "ru")).toBe("/ru");
    expect(localizedPath("hy", "/services/")).toBe("/hy/services");
  });
});

describe("backend translation selection", () => {
  const translations = {
    hy: { name: "Հայերեն", description: "Հայերեն նկարագրություն", tags: ["մեկ"] },
    ru: { name: "Русский", description: "", tags: [] },
  };

  it("uses the requested authored translation", () => {
    expect(selectLocalizedField(translations, "ru", "name")).toEqual({ value: "Русский", resolvedLocale: "ru" });
  });

  it("falls back field-by-field to Armenian and reports the resolved language", () => {
    expect(selectLocalizedField(translations, "en", "description")).toEqual({
      value: "Հայերեն նկարագրություն",
      resolvedLocale: "hy",
    });
  });

  it("preserves deliberately authored empty values instead of falling back", () => {
    expect(selectLocalizedField(translations, "ru", "description")).toEqual({ value: "", resolvedLocale: "ru" });
    expect(selectLocalizedField(translations, "ru", "tags")).toEqual({ value: [], resolvedLocale: "ru" });
  });
});

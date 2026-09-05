import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/api/public-client.ts",
        "src/api/booking-client.ts",
        "src/api/staff-client.ts",
        "src/api/public-view-models.ts",
        "src/components/locale-switcher.tsx",
        "src/components/booking-challenge.tsx",
        "src/components/booking-flow.tsx",
        "src/components/booking-webmcp.tsx",
        "src/components/localized-text.tsx",
        "src/components/page-shell.tsx",
        "src/components/public-media.tsx",
        "src/i18n/locales.ts",
        "src/i18n/localized-content.ts",
        "src/lib/env.ts",
        "src/lib/booking-date.ts",
        "src/lib/pagination.ts",
        "src/lib/password-policy.ts",
        "src/lib/safe-urls.ts",
        "src/lib/security-headers.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});

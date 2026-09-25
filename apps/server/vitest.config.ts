import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    setupFiles: ["./src/__tests__/test-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Allow tests to import from src without extensions
    server: {
      deps: {
        inline: [/@better-auth/, /better-auth/],
      },
    },
  },
});
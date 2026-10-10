import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest for decoupled UI tests on the landing page (Next.js app router).
// next/link and next/navigation are stubbed in src/test/setup.ts and the
// @repo/ui surface is mocked per test file, so no server or network is needed.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", ".turbo"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});

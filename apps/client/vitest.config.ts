import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest for decoupled UI/unit tests. No live server, database, or network:
// components under test get their data from mocked contexts (see
// src/test/utils.tsx). Runs with `pnpm --filter client test`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@amped/web3": path.resolve(__dirname, "../../packages/web3/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "cypress"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});

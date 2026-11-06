import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Build id baked into the bundle (for the NewVersionDialog check) and written
// to dist/version.json. Each deployment gets a fresh id, so a running tab that
// polls version.json detects that a newer build is deployed. Null in
// development, where the check is disabled.
const APP_BUILD_ID = process.env.NODE_ENV === "production" ? new Date().toISOString() : null;

// Emits dist/version.json so the running app can compare its baked build id
// against the deployed one (packages/ui new-version.tsx).
function versionManifestPlugin(): Plugin {
  return {
    name: "app-version-manifest",
    generateBundle() {
      if (!APP_BUILD_ID) return;
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: APP_BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionManifestPlugin()],
  optimizeDeps: {
    exclude: ["lucide-react"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "process.env": process.env,
    global: "globalThis",
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
});

import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables based on mode
  // This will automatically load .env, .env.local, .env.[mode], .env.[mode].local
  const env = loadEnv(mode, process.cwd());

  console.log(`Running in ${mode} mode with VITE_DEMO_MODE=${env.VITE_DEMO_MODE}`);

  return {
    plugins: [react(), versionManifestPlugin()],
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@amped/web3": path.resolve(__dirname, "../../packages/web3/src/index.ts"),
      },
    },
    define: {
      "process.env": process.env,
      global: "globalThis", // Ensure globalThis is used instead of global
      __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
    },
    assetsInclude: ["**/*.lottie"],
  };
});

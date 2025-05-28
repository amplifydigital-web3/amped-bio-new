import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables based on mode
  // This will automatically load .env, .env.local, .env.[mode], .env.[mode].local
  const env = loadEnv(mode, process.cwd());
  
  console.log(`Running in ${mode} mode with VITE_DEMO_MODE=${env.VITE_DEMO_MODE}`);
  
  return {
    plugins: [react()],
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
    },
  };
});

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the local bindings from wrangler.jsonc (R2 CONTENT,
// the PROCESSOR Durable Object, the queues). The local configuration has no
// container, so tests use a fake toolbox; the toolbox has its own tests under
// container/test. The secret below is not a real secret.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { CONTENT_PROCESSOR_SECRET: "processor-test-secret" },
      },
    }),
  ],
  test: {
    // The toolbox tests run under node --test, not here
    exclude: ["container/**", "node_modules/**"],
  },
});

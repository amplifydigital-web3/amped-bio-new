import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the local configuration from wrangler.jsonc. The
// secrets below are test values, never real ones. fetch to the two API targets is
// stubbed in each test, so nothing leaves the test runner.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          STREAM_WEBHOOK_SECRET: "test-account-webhook-secret",
          PRODUCTION_FORWARD_SECRET: "test-production-forward-secret",
          STAGING_FORWARD_SECRET: "test-staging-forward-secret",
        },
      },
    }),
  ],
});

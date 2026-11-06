import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the bindings from wrangler.jsonc (local
// configuration): R2 CONTENT, KV TAKEDOWN, the DOWNLOADS Durable Object and the
// Cache API. The test key below is not a real key.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          MEDIA_TOKEN_KEYS:
            "t2:Z2F0ZXdheS10ZXN0LXNlY29uZC1rZXktbm90LWZvci1wcm9kdWN0aW9uLXVzZQ,t1:Z2F0ZXdheS10ZXN0LWtleS1ub3QtZm9yLXByb2R1Y3Rpb24tdXNlLWV2ZXItb2s",
        },
      },
    }),
  ],
});

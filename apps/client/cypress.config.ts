// @ts-expect-error - CJS module not supported
import { defineConfig } from "cypress";

// @ts-expect-error - CJS module not supported
module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    supportFile: false,
    specPattern: "cypress/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}",
    setupNodeEvents(_on, _config) {
      // implement node event listeners here
    },
  },
});

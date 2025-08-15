/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
const { defineConfig } = require("cypress");

// @ts-ignore
module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    supportFile: false,
    specPattern: "cypress/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}",
  },
});

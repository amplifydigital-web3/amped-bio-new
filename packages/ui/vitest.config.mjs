// Unit tests for the shared UI package (Theme Engine v2 phase 1b first): the
// creator look, the CreatorPage shell rendered to markup on the server, and
// the frame watchdog. No DOM, server, database or network. This package has
// no Vitest of its own yet, so `pnpm --filter @repo/ui test` runs the
// client's Vitest against this root. The config imports nothing so it loads
// from here; tests use Vitest globals.
export default {
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.{ts,tsx}"],
  },
};

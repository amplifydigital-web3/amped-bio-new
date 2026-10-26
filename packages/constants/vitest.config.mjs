// Unit tests for shared constants (the Theme Engine v2 registry first). Pure
// functions only: no DOM, server, database or network. This package has no
// Vitest of its own yet, so `pnpm --filter @repo/constants test` runs the
// client's Vitest against this root. The config imports nothing so it loads
// from here; tests use Vitest globals.
export default {
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
};

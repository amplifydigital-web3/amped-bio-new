import { describe, expect, it } from "vitest";
import { THEME_FILE_SCHEMA, themeFileConfig, themeFileV2 } from "../src";

// Theme Engine v2 theme files (spec 3.9): v2 wraps the config with a header.
describe("theme files", () => {
  it("writes the v2 header", () => {
    const file = themeFileV2("Northern Lights", "alice", new Date("2026-11-01T00:00:00Z"), {
      buttonColor: "#00ffaa",
    });
    expect(file).toEqual({
      $schema: THEME_FILE_SCHEMA,
      name: "Northern Lights",
      author: "alice",
      createdAt: "2026-11-01T00:00:00.000Z",
      config: { buttonColor: "#00ffaa" },
    });
  });

  it("reads the config from a v2 file and passes a v1 file through", () => {
    const config = { buttonColor: "#00ffaa" };
    expect(themeFileConfig(themeFileV2("A", null, "2026-11-01", config))).toEqual(config);
    expect(themeFileConfig(config)).toBe(config);
    // A header from somewhere else is not unwrapped
    expect(themeFileConfig({ $schema: "https://example.com", config })).toEqual({
      $schema: "https://example.com",
      config,
    });
  });
});

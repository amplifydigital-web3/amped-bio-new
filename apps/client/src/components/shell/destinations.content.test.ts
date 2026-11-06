import { afterEach, describe, expect, it, vi } from "vitest";
import {
  destinationForPanel,
  dockComposition,
  enabledDestinations,
  PANEL_TITLES,
} from "./destinations";

describe("Content destination (Build Board #20)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("renders nothing while VITE_CONTENT is off", () => {
    vi.stubEnv("VITE_CONTENT", "false");
    expect(enabledDestinations().map(d => d.id)).not.toContain("content");
  });

  it("sits in the Page group after Page, and in More on phones", () => {
    vi.stubEnv("VITE_CONTENT", "true");
    const enabled = enabledDestinations();
    const ids = enabled.map(d => d.id);
    expect(ids.indexOf("content")).toBe(ids.indexOf("page") + 1);
    expect(enabled.find(d => d.id === "content")?.group).toBe("page");
    const { dock, more } = dockComposition(enabled);
    if (enabled.length > 5) {
      expect(dock.map(d => d.id)).not.toContain("content");
      expect(more.map(d => d.id)).toContain("content");
    }
    expect(destinationForPanel("content")).toBe("content");
    expect(PANEL_TITLES.content).toBe("Content");
  });
});

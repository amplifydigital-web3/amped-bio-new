import { afterEach, describe, expect, it } from "vitest";
import { setFeatureFlagOverridesForTests } from "../../config/featureFlags";
import { destinationForPanel, dockComposition, enabledDestinations } from "./destinations";

describe("Inbox destination (Amped Messages, M5, spec 8.1)", () => {
  afterEach(() => setFeatureFlagOverridesForTests({}));

  it("is not in the rail while the messages flag is off, and the old inbox has no rail item", () => {
    setFeatureFlagOverridesForTests({ messages: false });
    expect(enabledDestinations().map(d => d.id)).not.toContain("inbox");
    expect(destinationForPanel("inbox")).toBeNull();
  });

  it("sits in Start after Explore, and the dock is Home, Page, Inbox, Wallet, More", () => {
    setFeatureFlagOverridesForTests({ messages: true, wallet: true, creatorPool: true });
    const enabled = enabledDestinations();
    const ids = enabled.map(d => d.id);
    expect(ids.indexOf("inbox")).toBe(ids.indexOf("explore") + 1);
    expect(enabled.find(d => d.id === "inbox")?.group).toBe("start");
    const { dock, more } = dockComposition(enabled);
    expect(dock.map(d => d.id)).toEqual(["home", "page", "inbox", "wallet"]);
    expect(more.map(d => d.id)).toContain("design");
    expect(destinationForPanel("inbox")).toBe("inbox");
  });
});

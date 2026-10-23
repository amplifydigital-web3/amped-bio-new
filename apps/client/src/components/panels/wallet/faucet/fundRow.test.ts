import { afterEach, describe, expect, it } from "vitest";
import { faucetRowMeta, focusFaucetHeading, HOME_FAUCET_PATH } from "./fundRow";

describe("faucetRowMeta", () => {
  const now = new Date("2026-10-23T12:00:00Z").getTime();

  it("reports ready, paused, empty and setup", () => {
    expect(faucetRowMeta("ready", 4, null, now)).toBe("Ready");
    expect(faucetRowMeta("paused", 0, null, now)).toBe("Paused");
    expect(faucetRowMeta("empty", 4, null, now)).toBe("Empty");
    expect(faucetRowMeta("setup", 2, null, now)).toBe("2 of 4 steps");
  });

  it("shows the time left after a request", () => {
    const next = new Date(now + (18 * 60 + 42) * 60_000);
    expect(faucetRowMeta("cooldown", 4, next, now)).toBe("Next in 18:42");
    expect(faucetRowMeta("sent", 4, null, now)).toBe("Requested");
  });

  it("has no text while loading", () => {
    expect(faucetRowMeta("loading", 0, null, now)).toBeNull();
  });
});

describe("focusFaucetHeading", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false when the faucet card is not on the page", () => {
    expect(focusFaucetHeading()).toBe(false);
  });

  it("focuses the card heading when the card is on the page", () => {
    document.body.innerHTML = '<article id="faucet"><h3>Daily faucet</h3></article>';
    Element.prototype.scrollIntoView = () => {};
    expect(focusFaucetHeading()).toBe(true);
    expect(document.activeElement?.textContent).toBe("Daily faucet");
  });

  it("points the Wallet at Home", () => {
    expect(HOME_FAUCET_PATH).toBe("/home?open=faucet");
  });
});

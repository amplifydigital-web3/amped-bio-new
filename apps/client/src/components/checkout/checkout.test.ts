import { afterEach, describe, expect, it, vi } from "vitest";
import { moneySheetColors } from "@repo/ui";

const query = vi.hoisted(() => vi.fn());
vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  trpcClient: { checkout: { quote: { query } } },
}));

import { createMockProvider, mockOutcome } from "./provider";

const ready = {
  id: "ab".repeat(16),
  status: "open",
  state: "ready" as const,
  provider: "mock" as const,
  item: {
    title: "Episode 4",
    publicId: "abc123",
    kind: "VIDEO",
    adult: false,
    path: "/maya/c/abc123",
  },
  creator: { handle: "maya", name: "Maya", image: null, theme: null },
  amount: "3000000",
  fee: "150000",
  feeBps: 500,
  quotedAt: new Date().toISOString(),
  validUntil: new Date().toISOString(),
  promoter: null,
};

afterEach(() => query.mockReset());

// Mobile checkout CK-2 (docs/features/mobile-checkout.md 5): the legibility guard
describe("moneySheetColors", () => {
  it("keeps the creator button when its label reads at 4.5:1", () => {
    const colors = moneySheetColors({
      buttonColor: "#16152B",
      fontColor: "#FFFFFF",
      containerColor: "#16152B",
    });
    expect(colors.guarded).toBe(false);
    expect(colors.button.background.toLowerCase()).toBe("#16152b");
  });

  it("turns the button neutral with the creator color as its border when it cannot read", () => {
    const colors = moneySheetColors({
      buttonColor: "#FFFF66",
      fontColor: "#FFFFFF",
      containerColor: "#FFFFFF",
    });
    // White on pale yellow fails; ink on pale yellow reads, so the label switches to ink
    expect(colors.guarded).toBe(true);
    expect(colors.button.color.toLowerCase()).toBe("#16152b");
  });

  it("puts text on a white surface when the creator text cannot read on the container", () => {
    const colors = moneySheetColors({ fontColor: "#EEEEEE", containerColor: "#FFFFFF" });
    expect(colors.surface.toLowerCase()).toBe("#ffffff");
    expect(colors.text.toLowerCase()).toBe("#16152b");
  });
});

describe("the mock payment provider", () => {
  it("reads QA outcomes from ?mock= and ignores unknown ones", () => {
    expect(mockOutcome("?mock=short")).toBe("short");
    expect(mockOutcome("?mock=steal")).toBeNull();
    expect(mockOutcome("")).toBeNull();
  });

  it("passes the server quote through and pays", async () => {
    query.mockResolvedValue(ready);
    const provider = createMockProvider(null);
    expect(await provider.quote(ready.id)).toEqual(ready);
    expect(provider.balanceOverride()).toBeNull();
    expect(provider.seedLastSeen(ready)).toBeNull();
    vi.useFakeTimers();
    const paid = provider.pay(ready.id, ready);
    await vi.runAllTimersAsync();
    expect(await paid).toEqual({ result: "paid" });
    vi.useRealTimers();
  });

  it("reaches every error state for QA", async () => {
    query.mockResolvedValue(ready);
    for (const state of ["paused", "limit", "seller"] as const) {
      expect((await createMockProvider(state).quote(ready.id)).state).toBe(state);
    }
    const removed = await createMockProvider("removed").quote(ready.id);
    expect(removed.state).toBe("removed");
    expect(removed.item).toBeNull();
    expect(createMockProvider("short").balanceOverride()).toBe(0n);
    expect(createMockProvider("price").seedLastSeen(ready)).toBe("2000000");
    vi.useFakeTimers();
    const failed = createMockProvider("failed").pay(ready.id, ready);
    await vi.runAllTimersAsync();
    expect(await failed).toEqual({ result: "failed" });
    vi.useRealTimers();
  });
});

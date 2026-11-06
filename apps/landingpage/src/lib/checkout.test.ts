import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trpc", () => ({ trpcClient: { checkout: { start: { mutate } } } }));

import { payUrl, startCheckout } from "./checkout";

// Mobile checkout CK-2: Buy on a public page opens the pay sheet on the app host
describe("startCheckout", () => {
  const assign = vi.fn();
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PANEL_URL", "https://app.staging.amped.bio");
    vi.stubGlobal("location", { assign });
    mutate.mockResolvedValue({ id: "ab".repeat(16), payPath: `/pay/${"ab".repeat(16)}` });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mutate.mockReset();
    assign.mockReset();
  });

  it("builds the pay URL on the app host", () => {
    expect(payUrl("/pay/x")).toBe("https://app.staging.amped.bio/pay/x");
  });

  it("starts a purchase intent with the source and promoter code, then navigates", async () => {
    await startCheckout({ publicId: "abc123", source: "item_page", via: "summer" });
    expect(mutate).toHaveBeenCalledWith({
      kind: "purchase",
      target: { type: "content", id: "abc123" },
      source: "item_page",
      via: "summer",
    });
    expect(assign).toHaveBeenCalledWith(`https://app.staging.amped.bio/pay/${"ab".repeat(16)}`);
  });

  it("leaves out an empty promoter code", async () => {
    await startCheckout({ publicId: "abc123", source: "bio", via: null });
    expect(mutate.mock.calls[0]![0]).not.toHaveProperty("via");
  });
});

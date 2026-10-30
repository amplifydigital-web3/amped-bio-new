import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSwitchHref } from "./panel";

// Mobile checkout CK-1: the checkout intent in the pay URL survives sign up
describe("authSwitchHref", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PANEL_URL", "https://app.staging.amped.bio");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps a safe returnTo to the app host, with the email", () => {
    const params = new URLSearchParams({
      returnTo: "https://app.staging.amped.bio/pay/0192f0aa0000700080000000000000aa",
    });
    const href = authSwitchHref("/register", params, "fan@example.test");
    const query = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/register?")).toBe(true);
    expect(query.get("email")).toBe("fan@example.test");
    expect(query.get("returnTo")).toBe(
      "https://app.staging.amped.bio/pay/0192f0aa0000700080000000000000aa"
    );
  });

  it("drops an off site returnTo", () => {
    const params = new URLSearchParams({ returnTo: "https://evil.example/pay" });
    expect(authSwitchHref("/login", params)).toBe("/login");
  });

  it("falls back to the legacy redirect", () => {
    const params = new URLSearchParams({ redirect: "/explore" });
    expect(authSwitchHref("/login", params)).toBe("/login?redirect=%2Fexplore");
  });
});

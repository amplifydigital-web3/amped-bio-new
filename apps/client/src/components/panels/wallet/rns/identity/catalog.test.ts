import { describe, expect, it, vi } from "vitest";

// AB-3 (Build Board #66, spec 3.6): the verify link carries the order and nothing else
describe("authbaseVerifyUrl", () => {
  it("opens Authbase's Amped.Bio sign in with /verify?order= encoded in returnTo", async () => {
    vi.stubEnv("VITE_AUTHBASE_URL", "https://authbase.test");
    vi.resetModules();
    const { authbaseVerifyUrl } = await import("./catalog");
    const ref = "0192f3a4b5c6d7e8f90a1b2c3d4e5f60";
    const url = new URL(authbaseVerifyUrl(ref)!);
    expect(url.origin + url.pathname).toBe("https://authbase.test/sso/amped");
    expect(url.searchParams.get("returnTo")).toBe(`/verify?order=${ref}`);
    expect(url.search).toBe(`?returnTo=%2Fverify%3Forder%3D${ref}`);
    expect([...url.searchParams.keys()]).toEqual(["returnTo"]);
  });

  it("refuses anything that is not an order ref", async () => {
    vi.stubEnv("VITE_AUTHBASE_URL", "https://authbase.test");
    vi.resetModules();
    const { authbaseVerifyUrl } = await import("./catalog");
    expect(authbaseVerifyUrl("x&returnTo=https://evil.test")).toBeUndefined();
  });
});

/**
 * Screen Review 074 D3: /sign accepts a SIGN_MESSAGE only from the site or a
 * redirect URI origin of an enabled registered app.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clients: [] as Array<{
    name: string | null;
    icon: string | null;
    uri: string | null;
    redirectUris: string;
    clientId: string;
  }>,
}));

vi.mock("@repo/database", () => ({
  prisma: { oauthClient: { findMany: vi.fn(async () => state.clients) } },
}));
vi.mock("../utils/cache", () => ({
  cache: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));

import { checkSignOrigin, originOf } from "../services/signOrigin";

beforeEach(() => {
  state.clients = [
    {
      name: "RNS",
      icon: "https://rns.example/icon.png",
      uri: "https://rns.example/about",
      redirectUris: JSON.stringify(["https://app.rns.example/callback"]),
      clientId: "rns",
    },
  ];
});

describe("sign origin registry", () => {
  it("accepts the site origin and each redirect URI origin", async () => {
    await expect(checkSignOrigin("https://rns.example")).resolves.toEqual({
      registered: true,
      appName: "RNS",
      icon: "https://rns.example/icon.png",
    });
    await expect(checkSignOrigin("https://app.rns.example")).resolves.toMatchObject({
      registered: true,
    });
  });

  it("refuses any other origin, a lookalike host and a non http origin", async () => {
    for (const origin of [
      "https://evil.example",
      "https://rns.example.evil.example",
      "http://rns.example",
      "null",
      "javascript:alert(1)",
    ]) {
      await expect(checkSignOrigin(origin)).resolves.toEqual({ registered: false });
    }
  });

  it("normalizes case and drops paths", () => {
    expect(originOf("HTTPS://RNS.Example/path?x=1")).toBe("https://rns.example");
    expect(originOf("not a url")).toBeNull();
  });
});

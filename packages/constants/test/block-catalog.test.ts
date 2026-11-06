import { describe, expect, it } from "vitest";
import {
  BLOCK_CATALOG,
  BLOCK_FAMILIES,
  SINGLETON_BLOCK_TYPES,
  catalogEntryIsNew,
  catalogEntryShown,
  searchCatalog,
  type FeatureFlagKey,
} from "../src";

const allOn = () => true;
const allOff = () => false;

describe("Add block catalog (ab1)", () => {
  it("has unique ids and only known families", () => {
    const ids = BLOCK_CATALOG.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const families = new Set(BLOCK_FAMILIES.map(family => family.id));
    for (const entry of BLOCK_CATALOG) expect(families.has(entry.family)).toBe(true);
  });

  it("gives every available tile an add action and no Coming soon tile one", () => {
    for (const entry of BLOCK_CATALOG) {
      if (entry.status === "available") expect(entry.add).toBeDefined();
      else expect(entry.add).toBeUndefined();
    }
  });

  it("marks singletons with the same types the server enforces", () => {
    for (const entry of BLOCK_CATALOG) {
      if (entry.singletonType) {
        expect(SINGLETON_BLOCK_TYPES as readonly string[]).toContain(entry.singletonType);
      }
    }
  });

  it("lists no retired or hidden legacy types", () => {
    const retired = ["uniswap", "nft-collection", "token-price", "substack", "telegram_group"];
    for (const entry of BLOCK_CATALOG) {
      expect(retired).not.toContain(entry.id);
      const add = entry.add as { type?: string; platform?: string } | undefined;
      expect(retired).not.toContain(add?.type);
      expect(retired).not.toContain(add?.platform);
    }
  });

  it("shows flagged tiles only with their flag, and swaps Telegram for Message me", () => {
    const shown = (isOn: (flag: FeatureFlagKey) => boolean) =>
      BLOCK_CATALOG.filter(entry => catalogEntryShown(entry, isOn)).map(entry => entry.id);
    expect(shown(allOff)).not.toContain("follow");
    expect(shown(allOff)).not.toContain("message");
    expect(shown(allOn)).toContain("message");
    expect(shown(allOn)).not.toContain("telegram_message");
    expect(shown(flag => flag === "telegram")).toContain("telegram_message");
  });

  it("searches names, lines and keywords", () => {
    const ids = (query: string) => searchCatalog(BLOCK_CATALOG, query).map(entry => entry.id);
    expect(ids("calendly")).toEqual(expect.arrayContaining(["embed", "booking"]));
    expect(ids("sign up")).toEqual(expect.arrayContaining(["email_signup", "sms", "leadmagnet"]));
    expect(ids("pinterest board")).toEqual([]);
    expect(searchCatalog(BLOCK_CATALOG, "", "commerce").every(e => e.family === "commerce")).toBe(true);
  });

  it("shows New for 30 days after release", () => {
    const entry = { ...BLOCK_CATALOG[0]!, releasedAt: "2026-11-01T00:00:00Z" };
    expect(catalogEntryIsNew(entry, new Date("2026-11-10T00:00:00Z"))).toBe(true);
    expect(catalogEntryIsNew(entry, new Date("2026-12-05T00:00:00Z"))).toBe(false);
  });
});

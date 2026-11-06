/**
 * Reserved handles (Build Board D2, docs/features/reserved-handles.md).
 * The matcher, the generator base, the sign up and update hooks, and the route
 * guard that keeps the system tier in step with the landing app's routes.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  SYSTEM_RESERVED_HANDLES,
  generatedHandleBase,
  handlePrefixForm,
  handleSkeleton,
  isSystemReservedHandle,
  matchReservedIn,
  publicReservedReason,
  seedAdminRows,
  type AdminReservedRow,
} from "@repo/constants";
import { checkSignUpHandle, refuseHandleUpdate } from "../utils/handleHooks";

const seed = seedAdminRows();
const LENGTHS = { minLength: 2, maxLength: 64 };

function row(partial: Partial<AdminReservedRow> & { word: string }): AdminReservedRow {
  return {
    id: `t:${partial.word}`,
    kind: "EXACT",
    category: "BRAND",
    expiresAt: null,
    assignedUserId: null,
    ...partial,
  };
}

describe("system tier", () => {
  it("reserves route and system words in any case and with an @", () => {
    for (const word of ["pools", "POOLS", "@admin", " login ", "age-check", "u"]) {
      expect(isSystemReservedHandle(word)).toBe(true);
    }
  });

  it("reserves separator variants of a system word", () => {
    for (const word of ["admin_", "-admin-", "ad-min", "agecheck", "age_check"]) {
      expect(isSystemReservedHandle(word)).toBe(true);
    }
  });

  it("reserves the underscore prefix", () => {
    expect(isSystemReservedHandle("_foo")).toBe(true);
  });

  it("leaves ordinary handles alone", () => {
    for (const word of ["mayalin", "poolside", "administrator", "sign-painter", "newyork"]) {
      expect(isSystemReservedHandle(word)).toBe(false);
    }
  });

  it("folds forms as the spec says", () => {
    expect(handleSkeleton("Ad-Min_")).toBe("admin");
    expect(handlePrefixForm("amped_x")).toBe("amped-x");
  });
});

describe("matchReservedIn", () => {
  it("matches seeded company and trust words and prefixes", () => {
    for (const word of ["amped", "support", "sup_port", "amped-joe", "amped_joe", "admin-smith"]) {
      const match = matchReservedIn(word, seed);
      expect(match.reserved, word).toBe(true);
    }
  });

  it("matches the system tier first", () => {
    expect(matchReservedIn("pools", seed)).toEqual({ reserved: true, tier: "system" });
  });

  it("does not match ordinary handles or longer words", () => {
    for (const word of ["mayalin", "supporter", "ampedup", "teamwork", "helpful"]) {
      expect(matchReservedIn(word, seed).reserved, word).toBe(false);
    }
  });

  it("ignores a row past its end date", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const rows = [
      row({ word: "northlight", category: "HOLD", expiresAt: new Date("2026-10-31T00:00:00Z") }),
    ];
    expect(matchReservedIn("northlight", rows, now).reserved).toBe(false);
    const live = [
      row({ word: "northlight", category: "HOLD", expiresAt: new Date("2027-01-31T00:00:00Z") }),
    ];
    expect(matchReservedIn("northlight", live, now).reserved).toBe(true);
  });

  it("reports the holder of an assigned word", () => {
    const match = matchReservedIn("acmewear", [row({ word: "acmewear", assignedUserId: 7 })]);
    expect(match).toMatchObject({ reserved: true, tier: "admin", assignedUserId: 7 });
  });

  it("prefers an exact row over a prefix row", () => {
    const rows = [
      row({ word: "acme-", kind: "PREFIX" }),
      row({ word: "acme-shop", assignedUserId: 3 }),
    ];
    expect(matchReservedIn("acme-shop", rows)).toMatchObject({ assignedUserId: 3 });
  });
});

describe("publicReservedReason (A5)", () => {
  it("says reserved for system, company, trust and brand words", () => {
    expect(publicReservedReason(matchReservedIn("pools", seed))).toBe("reserved");
    expect(publicReservedReason(matchReservedIn("amped", seed))).toBe("reserved");
    expect(publicReservedReason(matchReservedIn("support", seed))).toBe("reserved");
    expect(publicReservedReason(matchReservedIn("acme", [row({ word: "acme" })]))).toBe("reserved");
  });

  it("says taken for partner and hold words", () => {
    const rows = [
      row({ word: "partnerco", category: "PARTNER" }),
      row({ word: "northlight", category: "HOLD" }),
    ];
    expect(publicReservedReason(matchReservedIn("partnerco", rows))).toBe("taken");
    expect(publicReservedReason(matchReservedIn("northlight", rows))).toBe("taken");
  });

  it("says nothing for a free word", () => {
    expect(publicReservedReason(matchReservedIn("mayalin", seed))).toBeNull();
  });
});

describe("generatedHandleBase (spec 4.6)", () => {
  it("strips a reserved prefix", () => {
    expect(generatedHandleBase("amped-joe", seed, LENGTHS)).toBe("joe");
    expect(generatedHandleBase("amped_joe", seed, LENGTHS)).toBe("joe");
    expect(generatedHandleBase("_foo", seed, LENGTHS)).toBe("foo");
    expect(generatedHandleBase("admin-smith", seed, LENGTHS)).toBe("smith");
  });

  it("lowercases and drops characters a handle cannot hold", () => {
    expect(generatedHandleBase("John.Doe", seed, LENGTHS)).toBe("johndoe");
  });

  it("falls back to user when nothing usable is left", () => {
    expect(generatedHandleBase("amped-", seed, LENGTHS)).toBe("user");
    expect(generatedHandleBase("_", seed, LENGTHS)).toBe("user");
    expect(generatedHandleBase("x", seed, LENGTHS)).toBe("user");
  });

  it("keeps a reserved exact base, so the suffix makes it free", () => {
    const base = generatedHandleBase("support", seed, LENGTHS);
    expect(base).toBe("support");
    expect(matchReservedIn(`${base}4821`, seed).reserved).toBe(false);
  });

  it("leaves room for the suffix", () => {
    expect(generatedHandleBase("a".repeat(80), seed, LENGTHS).length).toBeLessThanOrEqual(50);
  });
});

describe("sign up and update hooks (spec 4.4, 4.8)", () => {
  it("returns undefined when no handle was sent", async () => {
    await expect(checkSignUpHandle(undefined)).resolves.toBeUndefined();
    await expect(checkSignUpHandle("")).resolves.toBeUndefined();
  });

  it("returns the lowercase form of a valid handle", async () => {
    await expect(checkSignUpHandle("@MayaLin")).resolves.toBe("mayalin");
  });

  it("refuses a reserved handle with INVALID_HANDLE and the reserved message", async () => {
    await expect(checkSignUpHandle("admin")).rejects.toMatchObject({
      body: { code: "INVALID_HANDLE", message: "This handle is reserved" },
    });
    await expect(checkSignUpHandle("amped-support")).rejects.toMatchObject({
      body: { code: "INVALID_HANDLE" },
    });
  });

  it("refuses a malformed handle", async () => {
    for (const bad of ["a b", "a", "x".repeat(65), 42]) {
      await expect(checkSignUpHandle(bad)).rejects.toMatchObject({
        body: { code: "INVALID_HANDLE", message: "This handle is not valid" },
      });
    }
  });

  it("refuses any update that carries a handle", () => {
    expect(() => refuseHandleUpdate({ handle: "admin" })).toThrow();
    expect(() => refuseHandleUpdate({ handle: null })).toThrow();
    expect(() => refuseHandleUpdate({ name: "Maya" })).not.toThrow();
    expect(() => refuseHandleUpdate(undefined)).not.toThrow();
  });
});

describe("route guard (acceptance 7)", () => {
  it("reserves every top level route of the landing app", () => {
    const appDir = path.resolve(__dirname, "../../../landingpage/src/app");
    const routes = fs
      .readdirSync(appDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      // Dynamic segments, route groups and dotted names cannot be handles
      .filter(name => !/^[[(]/.test(name) && !name.includes("."));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(SYSTEM_RESERVED_HANDLES.has(route), `/${route} must be reserved`).toBe(true);
    }
  });
});

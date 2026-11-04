/**
 * Feature flags in site_settings (services/featureFlags.ts). The database is
 * mocked; env is the real parsed schema with the flags this test sets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const rows = new Map<string, string>();
  return {
    rows,
    siteSettings: {
      findMany: vi.fn(async ({ where }: { where: { setting_key: { startsWith: string } } }) =>
        [...rows.entries()]
          .filter(([key]) => key.startsWith(where.setting_key.startsWith))
          .map(([setting_key, setting_value]) => ({ setting_key, setting_value }))
      ),
      upsert: vi.fn(
        async ({
          where,
          update,
        }: {
          where: { setting_key: string };
          update: { setting_value: string };
        }) => {
          rows.set(where.setting_key, update.setting_value);
        }
      ),
      deleteMany: vi.fn(async ({ where }: { where: { setting_key: string } }) => {
        rows.delete(where.setting_key);
      }),
    },
  };
});

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));

import { env } from "../env";
import {
  __setFeatureFlagOverridesForTests,
  isFeatureOn,
  listFeatureFlags,
  publicFeatureFlagOverrides,
  refreshFeatureFlags,
  setFeatureFlag,
} from "../services/featureFlags";

beforeEach(() => {
  db.rows.clear();
  __setFeatureFlagOverridesForTests({});
  env.CHECKOUT_ENABLED = false;
  env.ACCESS_GATING_ENABLED = false;
});

describe("isFeatureOn", () => {
  it("reads the server environment variable while there is no row", () => {
    expect(isFeatureOn("checkout")).toBe(false);
    env.CHECKOUT_ENABLED = true;
    expect(isFeatureOn("checkout")).toBe(true);
  });

  it("lets the admin's row win over the environment, both ways", async () => {
    env.CHECKOUT_ENABLED = true;
    await setFeatureFlag("checkout", false, 1);
    expect(isFeatureOn("checkout")).toBe(false);
    await setFeatureFlag("accessGating", true, 1);
    expect(isFeatureOn("accessGating")).toBe(true);
  });

  it("goes back to the environment when the row is cleared", async () => {
    env.CHECKOUT_ENABLED = true;
    await setFeatureFlag("checkout", false, 1);
    await setFeatureFlag("checkout", null, 1);
    expect(db.rows.has("feature_flag.checkout")).toBe(false);
    expect(isFeatureOn("checkout")).toBe(true);
  });
});

describe("refreshFeatureFlags", () => {
  it("loads rows written by another instance and ignores unknown or bad rows", async () => {
    db.rows.set("feature_flag.checkout", "true");
    db.rows.set("feature_flag.unknown", "true");
    db.rows.set("feature_flag.accessGating", "maybe");
    await refreshFeatureFlags();
    expect(isFeatureOn("checkout")).toBe(true);
    expect(isFeatureOn("accessGating")).toBe(false);
  });

  it("keeps the last rows when the database does not answer", async () => {
    __setFeatureFlagOverridesForTests({ checkout: true });
    db.siteSettings.findMany.mockRejectedValueOnce(new Error("down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await refreshFeatureFlags();
    expect(isFeatureOn("checkout")).toBe(true);
    error.mockRestore();
  });
});

describe("what leaves the API", () => {
  it("sends only rows of public flags to the apps", async () => {
    await setFeatureFlag("checkout", true, 1);
    await setFeatureFlag("rnsPublicIdentity", true, 1);
    await setFeatureFlag("accessGating", true, 1);
    expect(publicFeatureFlagOverrides()).toMatchObject({ checkout: true, accessGating: true });
    expect(publicFeatureFlagOverrides()).not.toHaveProperty("rnsPublicIdentity");
  });

  it("sends the API's value for a public flag with only a server variable", () => {
    __setFeatureFlagOverridesForTests({});
    expect(publicFeatureFlagOverrides()).toMatchObject({ accessGating: false });
    expect(publicFeatureFlagOverrides()).not.toHaveProperty("checkout");
  });

  it("lists every flag with its row and the value on the API", async () => {
    db.rows.set("feature_flag.checkout", "true");
    const flags = await listFeatureFlags();
    const checkout = flags.find(flag => flag.key === "checkout");
    expect(checkout).toMatchObject({ override: true, serverValue: true, scope: "public" });
    const rns = flags.find(flag => flag.key === "rns");
    expect(rns).toMatchObject({ override: null, serverValue: null });
  });
});

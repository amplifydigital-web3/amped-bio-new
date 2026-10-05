/**
 * Screen Review 100 I01 to I04: the RNS binding rule every surface trusts, and
 * the one suffix parser. The chain reader is injected, so no RPC is needed.
 */
import { describe, it, expect } from "vitest";
import {
  checkRnsLabel,
  formatRnsName,
  parseRnsInput,
  RNS_CHAIN,
  RNS_GRACE_PERIOD_SECONDS,
  rnsExpiryState,
} from "@repo/web3";
import {
  assertRnsBinding,
  checkRnsBinding,
  RNS_BINDING_MESSAGES,
  type RnsNameRecord,
} from "../services/rns";

const WALLET = "0x7a3F00000000000000000000000000000000c91E";
const OTHER = "0x1111111111111111111111111111111111111111";
const NOW = 1_790_000_000;
const DAY = 86_400;

const reader = (record: Partial<RnsNameRecord>) => async (): Promise<RnsNameRecord> => ({
  expiry: NOW + 365 * DAY,
  owner: WALLET,
  addr: WALLET,
  ...record,
});

describe("parseRnsInput", () => {
  it.each([
    ["mayalin", "mayalin"],
    [" MayaLin ", "mayalin"],
    ["@mayalin", "mayalin"],
    ["mayalin.revo", "mayalin"],
    ["mayalin.revotest.eth", "mayalin"],
    ["mayalin.eth", "mayalin"],
    [formatRnsName("mayalin", RNS_CHAIN.id), "mayalin"],
  ])("reads %j as the label %j", (input, label) => {
    expect(parseRnsInput(input, RNS_CHAIN.id)).toBe(label);
  });

  it("keeps a dot inside the label so the name rule rejects it", () => {
    const label = parseRnsInput("maya.lin.revo", RNS_CHAIN.id);
    expect(label).toBe("maya.lin");
    expect(checkRnsLabel(label)).toBe("characters");
  });

  it("applies the length rule", () => {
    expect(checkRnsLabel("maya")).toBe("length");
    expect(checkRnsLabel("mayalin-studio")).toBeNull();
  });
});

describe("rnsExpiryState", () => {
  it("uses the registration expiry, with grace as its own state", () => {
    expect(rnsExpiryState(NOW + 60 * DAY, NOW)).toBe("active");
    expect(rnsExpiryState(NOW + 14 * DAY, NOW)).toBe("expiring");
    expect(rnsExpiryState(NOW - 60, NOW)).toBe("grace");
    expect(rnsExpiryState(NOW - RNS_GRACE_PERIOD_SECONDS - 1, NOW)).toBe("lapsed");
  });
});

describe("checkRnsBinding", () => {
  it("binds a valid name owned by and resolving to the wallet", async () => {
    const result = await checkRnsBinding("mayalin.revo", WALLET, reader({}), NOW);
    expect(result).toEqual({
      ok: true,
      label: "mayalin",
      name: formatRnsName("mayalin", RNS_CHAIN.id),
      expiry: NOW + 365 * DAY,
    });
  });

  it("compares addresses without case", async () => {
    const result = await checkRnsBinding("mayalin", WALLET.toLowerCase(), reader({}), NOW);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["no wallet", null, {}, "no_wallet"],
    ["another owner", WALLET, { owner: OTHER }, "not_owner"],
    ["addr elsewhere", WALLET, { addr: OTHER }, "addr_elsewhere"],
    ["addr unset", WALLET, { addr: null }, "addr_elsewhere"],
    ["never registered", WALLET, { expiry: 0, owner: null, addr: null }, "not_found"],
    ["expired past grace", WALLET, { expiry: NOW - 30 * DAY, owner: null }, "expired"],
    ["in the grace period", WALLET, { expiry: NOW - 60 }, "expired"],
  ] as const)("refuses %s", async (_label, wallet, record, reason) => {
    const result = await checkRnsBinding("mayalin", wallet, reader(record), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("refuses a label that breaks the name rule without reading the chain", async () => {
    let reads = 0;
    const result = await checkRnsBinding(
      "a.b",
      WALLET,
      async () => {
        reads += 1;
        return { expiry: 0, owner: null, addr: null };
      },
      NOW
    );
    expect(result.ok).toBe(false);
    expect(reads).toBe(0);
  });
});

describe("assertRnsBinding (user.edit)", () => {
  it("returns the canonical name to store", async () => {
    await expect(assertRnsBinding("MayaLin.revo", WALLET, reader({}))).resolves.toBe(
      formatRnsName("mayalin", RNS_CHAIN.id)
    );
  });

  it("fails closed with no wallet", async () => {
    await expect(assertRnsBinding("mayalin", null, reader({}))).rejects.toThrow(
      RNS_BINDING_MESSAGES.no_wallet
    );
  });

  it("refuses a name owned by another wallet", async () => {
    await expect(assertRnsBinding("mayalin", WALLET, reader({ owner: OTHER }))).rejects.toThrow(
      RNS_BINDING_MESSAGES.not_linked
    );
  });

  it("refuses an expired name", async () => {
    await expect(
      assertRnsBinding("mayalin", WALLET, reader({ expiry: 1_000, owner: null }))
    ).rejects.toThrow(RNS_BINDING_MESSAGES.not_linked);
  });

  it("refuses when the chain read fails", async () => {
    await expect(
      assertRnsBinding("mayalin", WALLET, async () => {
        throw new Error("rpc down");
      })
    ).rejects.toThrow("We could not check this RNS name");
  });
});

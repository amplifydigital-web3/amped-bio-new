import { beforeEach, describe, expect, it } from "vitest";
import {
  ChainSwitchError,
  WALLET_TOKEN_EXPIRATION_KEY,
  WalletDisconnectedError,
  WalletMismatchError,
  clearWalletBrowserState,
  isWalletMismatch,
  sameAddress,
} from "./walletSession";
import { classifyUsdcSignError } from "@/components/panels/wallet/send/useUsdcSigner";

const ROB = "0x5A0b54D5dc17e0AadC383d2db43B0a0D3E029c4c";
const JOHN = "0x1111111111111111111111111111111111111111";

describe("wallet address checks", () => {
  it("treats the same address in any case as the same wallet", () => {
    expect(sameAddress(ROB, ROB.toLowerCase())).toBe(true);
    expect(isWalletMismatch(ROB, ROB.toLowerCase())).toBe(false);
  });

  it("flags another account's live wallet as a mismatch", () => {
    expect(isWalletMismatch(JOHN, ROB)).toBe(true);
  });

  it("does not flag a mismatch when either side is unknown", () => {
    expect(isWalletMismatch(null, ROB)).toBe(false);
    expect(isWalletMismatch(JOHN, undefined)).toBe(false);
  });

  it("never matches an invalid address", () => {
    expect(sameAddress("0xnotanaddress", "0xnotanaddress")).toBe(false);
  });
});

describe("clearWalletBrowserState", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("removes wallet SDK state and keeps the app's own keys", () => {
    localStorage.setItem(WALLET_TOKEN_EXPIRATION_KEY, "123");
    localStorage.setItem("wagmi.store", "{}");
    localStorage.setItem("wagmi.recentConnectorId", "auth");
    localStorage.setItem("Web3Auth-cachedAdapter", "auth");
    localStorage.setItem("auth_store", "{}");
    localStorage.setItem("amped:dismissed-announcement", "1");
    sessionStorage.setItem("Web3Auth-session", "x");

    clearWalletBrowserState();

    expect(localStorage.getItem(WALLET_TOKEN_EXPIRATION_KEY)).toBeNull();
    expect(localStorage.getItem("wagmi.store")).toBeNull();
    expect(localStorage.getItem("wagmi.recentConnectorId")).toBeNull();
    expect(localStorage.getItem("Web3Auth-cachedAdapter")).toBeNull();
    expect(localStorage.getItem("auth_store")).toBeNull();
    expect(sessionStorage.getItem("Web3Auth-session")).toBeNull();
    expect(localStorage.getItem("amped:dismissed-announcement")).toBe("1");
  });
});

describe("classifyUsdcSignError", () => {
  it("names a wallet from another account", () => {
    expect(classifyUsdcSignError(new WalletMismatchError(JOHN, ROB))).toBe("wallet_mismatch");
  });

  it("names a wallet account that changed during the chain switch", () => {
    expect(classifyUsdcSignError(new WalletMismatchError(JOHN, ROB, true))).toBe("signer_changed");
  });

  it("names wagmi's refusal to sign for an account the connector does not hold", () => {
    const error = Object.assign(new Error("Account not found for connector"), {
      name: "ConnectorAccountNotFoundError",
    });
    expect(classifyUsdcSignError(error)).toBe("wallet_mismatch");
  });

  it("names a missing wallet", () => {
    expect(classifyUsdcSignError(new WalletDisconnectedError())).toBe("wallet_disconnected");
  });

  it("names a failed chain switch, and a cancelled one as a cancel", () => {
    expect(classifyUsdcSignError(new ChainSwitchError(new Error("boom")))).toBe(
      "chain_switch_failed"
    );
    expect(classifyUsdcSignError(new ChainSwitchError({ code: 4001, message: "nope" }))).toBe(
      "sign_rejected"
    );
  });

  it("names a cancel and any other signing error", () => {
    expect(classifyUsdcSignError({ code: 4001, message: "User rejected the request" })).toBe(
      "sign_rejected"
    );
    expect(classifyUsdcSignError(new Error("Cannot sign messages"))).toBe("sign_failed");
  });
});

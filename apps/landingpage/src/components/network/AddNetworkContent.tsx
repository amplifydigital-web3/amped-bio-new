"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Notice, TESTNET_NOTICE, cn } from "@repo/ui";
import { libertasTestnet, revolutionDevnet } from "@repo/web3";
import { NetworkCard, type WalletState } from "@/components/network/NetworkCard";

function parseChainId(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const id = Number.parseInt(value, 16);
  return Number.isFinite(id) ? id : null;
}

// Screen Review 073 I05, I13: read the wallet without asking for anything
// (eth_chainId and eth_accounts never prompt), then follow chainChanged and
// accountsChanged so the button stays current. Listeners go on unmount.
function useWallet(): WalletState {
  const [wallet, setWallet] = useState<WalletState>({
    present: null,
    chainId: null,
    account: null,
  });

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) {
      setWallet({ present: false, chainId: null, account: null });
      return;
    }
    let active = true;
    setWallet(current => ({ ...current, present: true }));

    void Promise.all([
      ethereum.request({ method: "eth_chainId" }).catch(() => null),
      ethereum.request({ method: "eth_accounts" }).catch(() => []),
    ]).then(([chainId, accounts]) => {
      if (!active) return;
      setWallet({
        present: true,
        chainId: parseChainId(chainId),
        account: Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null,
      });
    });

    const onChainChanged = (value: unknown) =>
      setWallet(current => ({ ...current, chainId: parseChainId(value) }));
    const onAccountsChanged = (value: unknown) =>
      setWallet(current => ({
        ...current,
        account: Array.isArray(value) && typeof value[0] === "string" ? value[0] : null,
      }));

    ethereum.on("chainChanged", onChainChanged);
    ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      active = false;
      ethereum.removeListener("chainChanged", onChainChanged);
      ethereum.removeListener("accountsChanged", onAccountsChanged);
    };
  }, []);

  return wallet;
}

// Screen Review 073 I01, I09: the Libertas Testnet card, the testnet notice
// (tREVO appears on the page), then Developer networks closed by default.
export function AddNetworkContent() {
  const wallet = useWallet();
  const [developerOpen, setDeveloperOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="space-y-[21px]">
      <NetworkCard chain={libertasTestnet} wallet={wallet} />
      <Notice variant="warning" title="Testnet">
        {TESTNET_NOTICE}
      </Notice>
      <div>
        <button
          type="button"
          aria-expanded={developerOpen}
          aria-controls={panelId}
          onClick={() => setDeveloperOpen(open => !open)}
          className="prism-focus flex h-commit w-full items-center gap-3 border-y border-prism-line px-[13px] text-left font-prism transition-colors duration-prism-hover ease-prism hover:bg-white/40"
        >
          <span className="flex-1 text-prism-label font-semibold text-prism-ink">
            Developer networks
          </span>
          <span className="text-prism-meta text-prism-ink-2">1 network</span>
          <ChevronDown
            className={cn(
              "h-[21px] w-[21px] text-prism-ink-2 transition-transform duration-prism-control ease-prism motion-reduce:transition-none",
              developerOpen && "rotate-180"
            )}
            aria-hidden
          />
        </button>
        <div id={panelId} hidden={!developerOpen} className="pt-[13px]">
          {developerOpen && <NetworkCard chain={revolutionDevnet} wallet={wallet} developer />}
        </div>
      </div>
    </div>
  );
}

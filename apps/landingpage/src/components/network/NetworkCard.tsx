"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button, cn } from "@repo/ui";
import type { AVAILABLE_CHAINS } from "@repo/web3";

export type NetworkChain = (typeof AVAILABLE_CHAINS)[number];

export type WalletState = {
  // null until the page has looked for window.ethereum
  present: boolean | null;
  chainId: number | null;
  account: string | null;
};

type Outcome = "declined" | "failed" | null;

const toHexChainId = (id: number) => `0x${id.toString(16)}`;

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

function addChainParams(chain: NetworkChain) {
  return {
    chainId: toHexChainId(chain.id),
    chainName: chain.name,
    nativeCurrency: {
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    rpcUrls: [...chain.rpcUrls.default.http],
    blockExplorerUrls: [chain.blockExplorers.default.url],
  };
}

function errorCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : undefined;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function copyValue(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  } catch {
    toast.error("Not copied");
  }
}

// One manual settings row: label 13/16 ink-2, value 16/20 600 tabular, a 44
// copy button. At 390 the label sits above the value (073 I04).
function SettingRow({
  label,
  value,
  copyLabel,
  children,
}: {
  label: string;
  value: string;
  copyLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-touch items-center gap-3 border-b border-prism-line px-4 py-[8px] last:border-b-0">
      <dl className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <dt className="shrink-0 text-prism-meta text-prism-ink-2 sm:w-[110px]">{label}</dt>
        <dd className="min-w-0 break-all text-prism-label font-semibold tabular-nums text-prism-ink">
          {value}
        </dd>
      </dl>
      {children}
      {copyLabel && (
        <button
          type="button"
          onClick={() => void copyValue(value)}
          aria-label={copyLabel}
          className="prism-focus -mr-2 inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink transition-colors duration-prism-hover ease-prism hover:bg-white/70"
        >
          <Copy className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
}

// Screen Review 073: one network as a card. Libertas Testnet is the G3 lens
// with the rim and a primary 55; Revochain Devnet (developer) is G1 clear with
// no rim and a secondary 44 (I12). The button follows the wallet: Add to
// wallet, Switch to Libertas Testnet, or a success line when it is already
// there (I05). Declines and failures show inline (I06); no wallet shows the
// notice and the manual path (I07).
export function NetworkCard({
  chain,
  wallet,
  developer = false,
}: {
  chain: NetworkChain;
  wallet: WalletState;
  developer?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const onChain = wallet.chainId === chain.id;
  // Switch only when an account is exposed and the wallet is on another chain
  const canSwitch = !developer && !!wallet.account && wallet.chainId !== null && !onChain;
  const explorer = chain.blockExplorers.default.url;

  const add = async () => {
    await window.ethereum!.request({
      method: "wallet_addEthereumChain",
      params: [addChainParams(chain)],
    });
    toast.success(`${chain.name} added.`);
  };

  const run = async () => {
    if (!window.ethereum) return;
    setPending(true);
    setOutcome(null);
    try {
      if (canSwitch) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: toHexChainId(chain.id) }],
          });
        } catch (error) {
          // 4902: the wallet does not know the network yet, so add it
          if (errorCode(error) !== 4902) throw error;
          await add();
        }
      } else {
        await add();
      }
    } catch (error) {
      setOutcome(errorCode(error) === 4001 ? "declined" : "failed");
    } finally {
      setPending(false);
    }
  };

  const label = canSwitch ? `Switch to ${chain.name}` : "Add to wallet";

  return (
    <section
      aria-labelledby={`network-${chain.id}`}
      className={cn(
        "relative font-prism",
        developer ? "prism-glass-clear p-[21px]" : "prism-lens p-[21px] sm:p-[34px]"
      )}
    >
      {!developer && <span aria-hidden className="prism-rim" />}
      <div className="flex flex-wrap items-center gap-[13px]">
        <h2 id={`network-${chain.id}`} className="text-prism-panel-title text-prism-ink">
          {chain.name}
        </h2>
        <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-white/[0.92] px-2 text-prism-meta text-prism-ink-2">
          {developer ? "Developer" : "Testnet"}
        </span>
      </div>

      <div className="mt-[21px] space-y-[13px]">
        {wallet.present === false ? (
          <div className="prism-glass-clear flex items-start gap-3 !rounded-prism-13 p-[13px]">
            <Info className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] leading-6 text-prism-ink">
                No browser wallet found. Install a wallet such as MetaMask, or add these settings in
                your wallet by hand.
              </p>
              <Button asChild variant="ghost" className="mt-2">
                <a
                  href="https://metamask.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Get MetaMask, opens in a new tab"
                >
                  Get MetaMask
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        ) : onChain ? (
          <p className="prism-slab flex min-h-commit items-center gap-3 px-4 text-[16px] leading-6 text-prism-success">
            <CheckCircle2 className="h-[21px] w-[21px] shrink-0" aria-hidden />
            Your wallet is on {chain.name}
          </p>
        ) : (
          <div className="space-y-2">
            <Button
              size={developer ? "default" : "lg"}
              variant={developer ? "secondary" : "default"}
              className="w-full"
              disabled={pending || wallet.present === null}
              aria-busy={pending || undefined}
              onClick={() => void run()}
            >
              {pending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                !canSwitch && <Plus aria-hidden />
              )}
              {pending ? "Check your wallet" : label}
            </Button>
            {!developer && (
              <p className="text-center text-prism-meta text-prism-ink-2">
                Works with MetaMask and other browser wallets.
              </p>
            )}
          </div>
        )}

        {wallet.account && wallet.present && !developer && (
          <p className="text-prism-meta text-prism-ink-2">
            Wallet{" "}
            <span className="font-semibold tabular-nums text-prism-ink">
              {shortAddress(wallet.account)}
            </span>
            {canSwitch && " is on another network."}
          </p>
        )}

        {outcome === "declined" && (
          <div role="status" className="prism-slab flex items-center gap-3 px-4 py-[8px]">
            <Info className="h-[21px] w-[21px] shrink-0 text-prism-nav" aria-hidden />
            <p className="min-w-0 flex-1 text-[16px] leading-6 text-prism-ink">
              You closed the wallet request. Nothing changed.
            </p>
            <Button variant="ghost" onClick={() => void run()}>
              Retry
            </Button>
          </div>
        )}
        {outcome === "failed" && (
          <p
            role="alert"
            className="prism-slab flex items-start gap-2 px-4 py-[13px] text-prism-meta text-prism-danger"
          >
            <AlertCircle className="h-[21px] w-[21px] shrink-0" aria-hidden />
            Your wallet did not add the network. Add it by hand with the settings below.
          </p>
        )}
      </div>

      <h3 className="mt-[21px] text-prism-eyebrow uppercase text-prism-ink-2">Manual settings</h3>
      <div className="prism-slab mt-[8px]">
        <SettingRow label="Network name" value={chain.name} copyLabel="Copy network name" />
        <SettingRow label="Chain ID" value={String(chain.id)} copyLabel="Copy chain ID" />
        <SettingRow
          label="RPC URL"
          value={chain.rpcUrls.default.http[0]}
          copyLabel="Copy RPC URL"
        />
        <SettingRow
          label="Currency symbol"
          value={chain.nativeCurrency.symbol}
          copyLabel="Copy currency symbol"
        />
        <SettingRow
          label="Decimals"
          value={String(chain.nativeCurrency.decimals)}
          copyLabel="Copy decimals"
        />
        <SettingRow label="Block explorer" value={hostOf(explorer)}>
          <a
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open explorer, opens in a new tab"
            className="prism-focus -mr-2 inline-flex h-touch shrink-0 items-center gap-2 rounded-prism-13 px-2 text-prism-label font-semibold text-prism-nav hover:text-prism-nav-hover"
          >
            Open explorer
            <ExternalLink className="h-[21px] w-[21px]" aria-hidden />
          </a>
        </SettingRow>
      </div>
    </section>
  );
}

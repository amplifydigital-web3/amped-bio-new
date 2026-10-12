import { useEffect, useRef, useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import { ErrorCard, Skeleton, TESTNET_NOTICE } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useEditor } from "@/contexts/EditorContext";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { NetworkChip } from "./NetworkChip";
import { SummaryFigures } from "./SummaryFigures";
import { BalanceFigure } from "./BalanceFigure";
import { WalletActions } from "./WalletActions";

// How long the Wallet waits for an address before it says the wallet did not connect
const NO_ADDRESS_AFTER_MS = 10_000;

function Eyebrow() {
  return (
    <h2 className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
      Balance
    </h2>
  );
}

/**
 * 049 I04. Below the width where the top bar shows the wallet chip, the
 * header carries the address (6 plus 4, or the RevoName when RNS is on and
 * set) with a 44 copy button.
 */
function AddressLine({ address }: { address: string }) {
  const { profile } = useEditor();
  const { navigateToProfile } = useRNSNavigation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const revoName = import.meta.env.VITE_SHOW_RNS === "true" ? profile.revoName : null;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
      toast.add({ type: "success", title: "Address copied" });
    } catch {
      toast.add({ type: "error", title: "Could not copy the address" });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 lg:hidden">
      {revoName ? (
        <button
          type="button"
          onClick={() => navigateToProfile(revoName.split(".")[0])}
          className="prism-focus min-w-0 truncate rounded-prism-8 text-left text-prism-label font-semibold text-prism-nav underline-offset-4 hover:underline"
        >
          {revoName}
        </button>
      ) : (
        <span className="min-w-0 truncate text-prism-label font-semibold tabular-nums text-prism-ink">
          {short}
        </span>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy wallet address"
        className="prism-icon-btn prism-focus shrink-0"
      >
        {copied ? (
          <Check aria-hidden className="h-[21px] w-[21px] text-prism-success" />
        ) : (
          <Copy aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <section
      aria-busy
      aria-label="Loading your wallet"
      className="prism-glass-clear !rounded-prism-21 p-5 font-prism sm:p-8"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-[13px] w-[89px] rounded-full" />
        <Skeleton className="h-touch w-[144px] rounded-full" />
      </div>
      <Skeleton className="mt-5 h-[55px] w-[233px] rounded-prism-8" />
      <div className="mt-5 flex gap-[34px]">
        <Skeleton className="h-[36px] w-[89px] rounded-prism-8" />
        <Skeleton className="h-[36px] w-[89px] rounded-prism-8" />
      </div>
      <div className="mt-5 flex gap-3">
        <Skeleton className="h-commit w-[144px] rounded-prism-13" />
        <Skeleton className="h-commit w-[128px] rounded-prism-13 max-sm:hidden" />
      </div>
    </section>
  );
}

/**
 * 049 I11 edge case: true when the account still has no address (saved account
 * address first, then the live wallet) 10 s after the Wallet mounts. `retry`
 * re-runs the wallet connect and starts the wait again.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useNoWalletTimeout() {
  const wallet = useWalletContext();
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (wallet.address) return setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), NO_ADDRESS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [wallet.address, attempt]);

  const retry = () => {
    setTimedOut(false);
    setAttempt(current => current + 1);
    void wallet.connect().catch(() => undefined);
  };
  return { timedOut: timedOut && !wallet.address, retry };
}

/** 049 I11: the local error card used when no address arrives and by the boundary. */
export function WalletErrorCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <ErrorCard
      title={title}
      cause="Your wallet is created when you sign in. Reconnect to load it."
      onRetry={onRetry}
      retryLabel="Retry"
    />
  );
}

/**
 * Screen Review 049 (D19). One Wallet summary header: eyebrow Balance with the
 * network chip, the address on small screens, the balance, two figures, the
 * actions and the testnet line, in that order. The avatar, handle and six
 * stat tiles are gone (identity lives in the avatar menu, D17; creator stats
 * live in My Pool, D19).
 */
export function WalletSummary() {
  const { address } = useWalletContext();
  const showSkeleton = useDelayed(!address, 400);

  if (!address) {
    return showSkeleton ? <SummarySkeleton /> : <div className="h-[233px]" aria-hidden />;
  }

  return (
    <section
      aria-labelledby="wallet-summary-title"
      className="prism-glass-clear !rounded-prism-21 p-5 font-prism sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span id="wallet-summary-title" className="pt-[15px]">
          <Eyebrow />
        </span>
        <NetworkChip />
      </div>
      <div className="mt-5 space-y-5">
        <AddressLine address={address} />
        <BalanceFigure />
        <SummaryFigures />
        <WalletActions />
      </div>
      <p className="mt-5 flex items-start gap-2 border-t border-prism-line pt-5 text-prism-meta text-prism-ink-2">
        <Info aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-nav" />
        <span className="pt-0.5">{TESTNET_NOTICE}</span>
      </p>
    </section>
  );
}

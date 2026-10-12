import { useEffect, useRef, useState } from "react";
import { useChainId } from "wagmi";
import { getCurrencySymbol } from "@repo/web3";
import { Button, Skeleton, cn } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useDelayed } from "@/hooks/useDelayed";
import { formatTokenAmount } from "../../explore/pool-panel/format";

/**
 * Screen Review 050 I02, I08, I09, I11. The balance in Bebas 68/55 with the
 * chain's unit beside it, up to 4 decimals with trailing zeros removed and
 * digit grouping. Above 10 characters it drops to 42/34; it never truncates.
 * Loading shows a bar at the final size after 400ms; a failed read shows
 * Balance did not load with Retry, never a dash. A new figure fades in over
 * 233ms (instant under reduced motion) and is announced once.
 */
export function BalanceFigure({ pending }: { pending?: React.ReactNode }) {
  const { balance } = useWalletContext();
  const chainId = useChainId();
  const symbol = balance?.data?.symbol ?? getCurrencySymbol(chainId);
  const loading = !balance || balance.isPending;
  const showSkeleton = useDelayed(loading, 400);

  const amount = balance?.data ? formatTokenAmount(balance.data.value) : null;

  // Announce a changed balance once, never the first value
  const previous = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (amount === null) return;
    if (previous.current !== null && previous.current !== amount) {
      setAnnouncement(`Balance ${amount} ${symbol}`);
    }
    previous.current = amount;
  }, [amount, symbol]);

  let figure: React.ReactNode;
  if (amount !== null) {
    const long = amount.length > 10;
    figure = (
      <p
        key={amount}
        aria-label={`Balance ${amount} ${symbol}`}
        className="flex flex-wrap items-baseline gap-x-2 duration-prism-control ease-prism animate-in fade-in-0 motion-reduce:animate-none"
      >
        <span
          aria-hidden
          className={cn(
            "break-all font-prism-display tabular-nums text-prism-ink [text-shadow:0_1px_0_rgba(255,255,255,0.9),5px_13px_34px_rgba(48,47,93,0.14)]",
            long ? "text-prism-display-42" : "text-prism-display-68"
          )}
        >
          {amount}
        </span>
        <span aria-hidden className="text-prism-panel-title text-prism-ink-2">
          {symbol}
        </span>
      </p>
    );
  } else if (loading) {
    figure = showSkeleton ? (
      <Skeleton className="h-[55px] w-[233px] max-w-full rounded-prism-8" />
    ) : (
      <div className="h-[55px]" aria-hidden />
    );
  } else {
    figure = (
      <div className="flex min-h-[55px] flex-wrap items-center gap-3">
        <p role="alert" className="text-prism-label font-bold text-prism-ink">
          Balance did not load
        </p>
        <Button type="button" variant="ghost" onClick={() => void balance?.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      {figure}
      {pending}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

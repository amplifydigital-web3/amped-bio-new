import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowDownToLine, Plus, Send } from "lucide-react";
import { USDC_SYMBOL, formatUsdc } from "@repo/web3";
import { Button, Skeleton, trpc } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useDelayed } from "@/hooks/useDelayed";
import { paymentChain } from "@/utils/paymentChain";
import { useUsdcBalance } from "../hooks/useUsdcBalance";
import FundWalletDialog from "../dialogs/FundWalletDialog";
import ReceiveDialog from "../dialogs/ReceiveDialog";

function Eyebrow() {
  return (
    <h2 className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
      {USDC_SYMBOL}
    </h2>
  );
}

/**
 * Screen Review 137 (board w1). The USDC tile on the payment chain. It keeps
 * the lens shading (the card halo under the G3 lens fill) inside the same
 * clear glass border and shadow as the tREVO card, and fills the grid row so
 * both cards share one height. The halo is clipped to the card, so no glow
 * spills below or around it. The balance is in Bebas 68/55 as USD with two
 * decimals (spec decision 8), then the network line, and Send, Receive and
 * Fund. Send opens the gasless USDC send (?send=usdc). No testnet line: it
 * belongs to tREVO surfaces only.
 */
export function UsdcTile() {
  const { address } = useWalletContext();
  const balance = useUsdcBalance(address);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [, setParams] = useSearchParams();
  // Spec 3.2: the first view starts indexing this address and screens it once
  const seen = useMutation(trpc.usdc.seen.mutationOptions());
  const markSeen = seen.mutate;
  useEffect(() => {
    if (address) markSeen();
  }, [address, markSeen]);
  const showSkeleton = useDelayed(balance.isPending, 400);

  const amount = balance.data !== undefined ? formatUsdc(balance.data, 4) : null;

  let figure: React.ReactNode;
  if (amount !== null) {
    figure = (
      <p
        aria-label={`Balance ${amount} ${USDC_SYMBOL}`}
        className="flex flex-wrap items-baseline gap-x-2"
      >
        <span
          aria-hidden
          className="break-all font-prism-display tabular-nums text-prism-ink text-prism-display-68 [text-shadow:0_1px_0_rgba(255,255,255,0.9),5px_13px_34px_rgba(48,47,93,0.14)]"
        >
          {amount}
        </span>
        <span aria-hidden className="text-prism-panel-title text-prism-ink-2">
          {USDC_SYMBOL}
        </span>
      </p>
    );
  } else if (balance.isPending) {
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
        <Button type="button" variant="ghost" onClick={() => void balance.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="wallet-usdc-title" className="h-full">
      <div className="prism-glass-clear relative isolate h-full overflow-hidden !rounded-prism-21 p-5 font-prism sm:p-8">
        <span aria-hidden className="prism-halo-card" />
        <span
          aria-hidden
          className="prism-lens-fill pointer-events-none absolute inset-0 z-[-1] rounded-[inherit]"
        />
        <span id="wallet-usdc-title" className="relative">
          <Eyebrow />
        </span>
        <div className="relative mt-5 space-y-5">
          {figure}
          <p className="text-prism-meta text-prism-ink-2">
            {paymentChain.name} · a dollar stablecoin by Circle
          </p>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setParams(
                  current => {
                    const next = new URLSearchParams(current);
                    next.set("send", "usdc");
                    return next;
                  },
                  { replace: true }
                )
              }
              className="max-sm:w-full"
            >
              <Send aria-hidden />
              Send
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReceiveOpen(true)}
              className="max-sm:w-full"
            >
              <ArrowDownToLine aria-hidden />
              Receive
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFundOpen(true)}
              className="max-sm:w-full"
            >
              <Plus aria-hidden />
              Fund
            </Button>
          </div>
        </div>
      </div>

      <FundWalletDialog
        open={fundOpen}
        onOpenChange={setFundOpen}
        openReceiveModal={() => setReceiveOpen(true)}
      />
      <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} network="payment" />
    </section>
  );
}

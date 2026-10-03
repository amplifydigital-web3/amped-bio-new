import { ExternalLink, LoaderCircle } from "lucide-react";
import { Button, Notice, TESTNET_NOTICE, cn } from "@repo/ui";
import type { TxState } from "@/hooks/rns/useRegistration";

// Parts shared by the RNS value panel flows: register (078), extend and
// transfer (080) and publish (111).

export function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
      <dt className="text-prism-label text-prism-ink-2">{label}</dt>
      <dd
        className={cn(
          "text-right text-prism-label tabular-nums text-prism-ink",
          strong ? "font-bold" : "font-semibold"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function TxLink({ explorer, hash }: { explorer?: string; hash?: string }) {
  if (!explorer || !hash) return null;
  return (
    <Button asChild variant="ghost">
      <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">
        View transaction
        <ExternalLink aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Button>
  );
}

/** The solid compliance notice with the J0 line, plus an optional sentence. */
export function TestnetNotice({ extra }: { extra?: string }) {
  const body = TESTNET_NOTICE.replace(/^Testnet only\.\s*/, "");
  return (
    <Notice variant="warning" title="Testnet only.">
      {body}
      {extra ? ` ${extra}` : ""}
    </Notice>
  );
}

/** Confirm in wallet and on chain status rows (078 I11). */
export function ChainStatus({
  tx,
  explorer,
  what,
  note = "This continues if you close this panel.",
}: {
  tx: TxState;
  explorer?: string;
  what: string;
  note?: string;
}) {
  if (tx.phase !== "chain") return null;
  return (
    <div className="space-y-2">
      <div className="prism-slab flex min-h-commit items-center gap-3 px-4" role="status">
        <LoaderCircle
          aria-hidden
          className="h-[21px] w-[21px] shrink-0 animate-spin text-prism-nav motion-reduce:animate-none"
        />
        <span className="flex-1 text-prism-label font-semibold text-prism-ink">{what}</span>
        <TxLink explorer={explorer} hash={tx.hash} />
      </div>
      <p className="text-prism-meta text-prism-ink-2">{note}</p>
    </div>
  );
}

/** 078 I08: the You pay well in the calm commit state, Bebas amount and unit pill. */
export function YouPay({ amount, unit }: { amount: string; unit: string }) {
  // The amount always shows in full: the size steps down as it grows
  const size =
    amount.length > 10
      ? "text-[34px] leading-[34px] sm:text-[42px] sm:leading-[42px]"
      : amount.length > 7
        ? "text-[42px] leading-[42px] sm:text-[55px] sm:leading-[55px]"
        : amount.length > 5
          ? "text-[55px] leading-[55px] sm:text-[68px] sm:leading-[68px]"
          : "text-[68px] leading-[68px] sm:text-[88px] sm:leading-[88px]";
  return (
    <div className="rounded-prism-21 bg-white/80 px-5 pb-4 pt-3 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]">
      <p className="text-prism-eyebrow uppercase text-prism-ink-2">You pay</p>
      <p className="mt-1 flex min-w-0 items-end gap-2">
        <span
          className={cn("min-w-0 truncate font-prism-display tabular-nums text-prism-ink", size)}
        >
          {amount}
        </span>
        <span className="mb-2 shrink-0 text-prism-label font-bold text-prism-ink">{unit}</span>
      </p>
    </div>
  );
}

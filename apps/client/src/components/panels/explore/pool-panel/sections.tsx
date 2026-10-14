import React, { useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, Info, LoaderCircle, Wallet } from "lucide-react";
import { Button, TESTNET_NOTICE, cn } from "@repo/ui";

// Shared parts of the pool panel (Screen Review 046, 047, 048).

export const UNSTAKE_TERMS =
  "Unstake any time. Your tREVO returns to your wallet when the transaction confirms.";
export const RATE_HELPER =
  "Estimated from current network stake and rewards. It changes as stake changes and is not guaranteed.";
// QA-007, 046 I01: no APR or APY string in the panel, links included. The only
// rate article today has "apy" in its slug, so How it is calculated renders once
// the article moves to a slug without it. Same rule as the public pool page.
export const RATE_ARTICLE: string | null = null;
// 046 D1: "How pool rewards work" ships only once counsel approves the article.
// Set the URL here when it exists; until then the link does not render.
export const POOL_REWARDS_ARTICLE: string | null = null;

// Section 10 eyebrow with the 13x3 value marker.
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-prism text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
      {children}
    </h3>
  );
}

// G2 slab row: label left, value right (tabular), optional content under it.
export function SlabRow({
  label,
  value,
  children,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex min-h-5 items-center justify-between gap-4">
        <dt className="text-prism-label text-prism-ink-2">{label}</dt>
        {value !== undefined && (
          <dd className="text-right text-prism-label font-semibold tabular-nums text-prism-ink">
            {value}
          </dd>
        )}
      </div>
      {children}
    </div>
  );
}

export function Slab({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl className={cn("prism-slab divide-y divide-prism-line font-prism", className)}>
      {children}
    </dl>
  );
}

// The verbatim testnet line with a 21 info icon (footer of every board).
export function TestnetLine() {
  return (
    <p className="flex items-start gap-2 font-prism text-prism-meta text-prism-ink-2">
      <Info className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" aria-hidden />
      <span className="pt-0.5">{TESTNET_NOTICE}</span>
    </p>
  );
}

// Solid compliance card on Review (section 15): heading "Testnet only." and the
// rest of the verbatim line as the body.
export function ComplianceCard() {
  const body = TESTNET_NOTICE.replace(/^Testnet only\.\s*/, "");
  return (
    <div role="note" className="prism-notice flex items-start gap-3 font-prism">
      <Info className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink" aria-hidden />
      <div className="min-w-0 flex-1 text-prism-body text-prism-ink">
        <p className="font-bold text-prism-warning-ink">Testnet only.</p>
        {body}
      </div>
    </div>
  );
}

// Description clamped to three lines with Read more (046 I10). URLs become
// links that open in a new tab.
export function PoolDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node && !expanded) setOverflows(node.scrollHeight > node.clientHeight + 1);
  }, [text, expanded]);

  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className="px-4 py-3">
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-line break-words text-prism-body text-prism-ink",
          !expanded && "line-clamp-3"
        )}
      >
        {parts.map((part, index) =>
          /^https?:\/\//.test(part) ? (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="prism-focus font-semibold text-prism-nav underline underline-offset-2"
            >
              {part}
            </a>
          ) : (
            <React.Fragment key={index}>{part}</React.Fragment>
          )
        )}
      </p>
      {(overflows || expanded) && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          aria-expanded={expanded}
          onClick={() => setExpanded(open => !open)}
        >
          {expanded ? "Show less" : "Read more"}
        </Button>
      )}
    </div>
  );
}

// Confirm step body (048 I13): wallet first, then Submitting once the hash is back.
export function ConfirmBody({
  phase,
  verb,
}: {
  phase: "wallet" | "submitting";
  // "stake", "unstake" or "claim"
  verb: string;
}) {
  return (
    <div className="prism-slab flex items-start gap-3 p-5 font-prism" aria-live="polite">
      {phase === "wallet" ? (
        <Wallet className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-value-ink" aria-hidden />
      ) : (
        <LoaderCircle
          className="mt-0.5 h-[21px] w-[21px] shrink-0 animate-spin text-prism-nav motion-reduce:animate-none"
          aria-hidden
        />
      )}
      <div>
        <p className="text-prism-panel-title text-prism-ink">
          {phase === "wallet" ? "Confirm in your wallet" : "Submitting"}
        </p>
        <p className="mt-1 text-prism-body text-prism-ink-2">
          {phase === "wallet"
            ? `Approve the ${verb} in your wallet to continue.`
            : "Your wallet sent the transaction. Waiting for the network to confirm it."}
        </p>
      </div>
    </div>
  );
}

export function ExplorerTxLink({ href }: { href?: string }) {
  if (!href) return null;
  return (
    <Button variant="ghost" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden />
        View transaction
      </a>
    </Button>
  );
}

// Panel shaped skeleton (046 I16): three 44 slab rows in line color.
export function PanelSkeletonBody() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="h-[3px] w-full rounded-full bg-prism-line" />
      <div className="prism-slab divide-y divide-prism-line">
        {[0, 1, 2].map(row => (
          <div key={row} className="flex h-touch items-center justify-between px-4">
            <span className="h-3 w-24 rounded-full bg-prism-line" />
            <span className="h-3 w-16 rounded-full bg-prism-line" />
          </div>
        ))}
      </div>
      <div className="h-[131px] rounded-prism-21 bg-prism-line" />
    </div>
  );
}

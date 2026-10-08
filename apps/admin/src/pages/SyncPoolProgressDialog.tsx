import { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  cn,
  trpcClient,
} from "@repo/ui";
import { getCurrencySymbol } from "@repo/web3";
import { Spinner } from "../kit/parts";

// Screen Review 089 I12. Sync progress on the shared Dialog: a vertical step
// list with section 10 semantics (done success with a check and a hidden
// ", done"; current indigo with a #302F5D 700 label; next on the line color),
// live counts in a G2 slab of 44 rows, then the Summary grouped Scope,
// Events, Wallet match and Pool final state, and Done. A failure shows the
// region error card inside the dialog with Retry.

export interface SyncProgressEvent {
  id: string;
  step: number;
  phase: "init" | "scanning" | "processing" | "writing" | "finalizing" | "complete" | "error";
  message: string;
  percent: number;
  stakesFound: number;
  unstakesFound: number;
  currentBlock?: string;
  latestBlock?: string;
  stakesProcessed: number;
  unstakesProcessed: number;
  stakesSkipped: number;
  unstakesSkipped: number;
  stakesAlreadyIndexed: number;
  unstakesAlreadyIndexed: number;
  summary?: {
    stakes: { processed: number; skipped: number; alreadyIndexed: number };
    unstakes: { processed: number; skipped: number; alreadyIndexed: number };
    totalStaked: string;
    fansCount: number;
    totalOnChainEvents?: number;
    uniqueOnChainAddresses?: number;
    unknownAddressCount?: number;
    zeroBalanceCount?: number;
    totalNewStakeAmount?: string;
    totalNewUnstakeAmount?: string;
    scope?: {
      chainName: string;
      chainId: string;
      creationTxid: string;
      creationBlock: string;
      latestBlock: string;
      totalBlocks: string;
      blockRange: number;
    };
  };
}

interface SyncPoolProgressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  poolId: number;
  poolName: string;
  onComplete: () => void;
}

const STEPS: { label: string; phase: SyncProgressEvent["phase"] }[] = [
  { label: "Find the pool", phase: "init" },
  { label: "Scan stake and unstake events", phase: "scanning" },
  { label: "Match wallets and skip duplicates", phase: "processing" },
  { label: "Write new events", phase: "writing" },
  { label: "Recalculate pool totals", phase: "finalizing" },
];

const PHASE_ORDER: Record<string, number> = {
  init: 0,
  scanning: 1,
  processing: 2,
  writing: 3,
  finalizing: 4,
  complete: 5,
};

// Raw on-chain amounts use 18 decimals
const formatTokens = (raw?: string | number | null): string => {
  if (raw === undefined || raw === null || raw === "") return "0";
  try {
    const scaled = BigInt(raw) / 10n ** 15n;
    return (Number(scaled) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
  } catch {
    return String(raw);
  }
};

const count = (value: number | undefined) => (value ?? 0).toLocaleString("en-US");

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="prism-slab divide-y divide-prism-line">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-h-touch items-center justify-between gap-4 px-4">
          <dt className="text-prism-label text-prism-ink-2">{label}</dt>
          <dd className="text-right text-prism-label font-semibold tabular-nums text-prism-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function SyncPoolProgressDialog({
  isOpen,
  onClose,
  poolId,
  poolName,
  onComplete,
}: SyncPoolProgressDialogProps) {
  const [currentEvent, setCurrentEvent] = useState<SyncProgressEvent | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef<(() => void) | null>(null);
  const completedCalled = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const mountedRef = useRef(true);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isOpen) return;

    setCurrentEvent(null);
    setIsCompleted(false);
    setError(null);
    completedCalled.current = false;
    mountedRef.current = true;

    const subscription = trpcClient.admin.pools.syncPool.subscribe(
      { poolId },
      {
        onData(event: unknown) {
          if (!mountedRef.current) return;
          // tRPC SSE delivers tracked data directly; mockLink wraps in result.data
          const wrapped = event as { result?: { data?: unknown }; data?: unknown };
          const data = (wrapped.result?.data ?? wrapped.data ?? event) as SyncProgressEvent;
          setCurrentEvent(data);

          if (data.phase === "complete") {
            setIsCompleted(true);
            // Close the SSE connection so the browser does not reconnect
            abortRef.current?.();
            if (!completedCalled.current) {
              completedCalled.current = true;
              setTimeout(() => {
                if (mountedRef.current) onCompleteRef.current();
              }, 0);
            }
          }
          if (data.phase === "error") setError(data.message || "Sync failed");
        },
        onError(err) {
          if (!mountedRef.current) return;
          console.error("Subscription error:", err);
          setError(err.message || "Connection error");
        },
      }
    );

    abortRef.current = () => subscription.unsubscribe();
    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [isOpen, poolId, attempt]);

  const handleClose = () => {
    abortRef.current?.();
    onClose();
  };

  const currentIndex = isCompleted
    ? STEPS.length
    : (PHASE_ORDER[currentEvent?.phase ?? "init"] ?? 0);
  const summary = currentEvent?.summary;
  const symbol = summary?.scope ? getCurrencySymbol(Number(summary.scope.chainId)) : "tREVO";

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Syncing {poolName}</DialogTitle>
        </DialogHeader>

        {error ? (
          <ErrorCard
            title="The sync did not finish"
            cause="The connection to the chain or the server dropped. Nothing was lost; run it again."
            retryLabel="Retry"
            onRetry={() => setAttempt(a => a + 1)}
          />
        ) : (
          <>
            <ol aria-label="Sync steps" className="space-y-1">
              {STEPS.map((step, index) => {
                const state =
                  index < currentIndex ? "done" : index === currentIndex ? "current" : "next";
                return (
                  <li
                    key={step.label}
                    aria-current={state === "current" ? "step" : undefined}
                    className="flex min-h-touch items-center gap-3"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        state === "done" && "bg-prism-success text-white",
                        state === "current" &&
                          "bg-prism-nav text-white shadow-[0_0_0_4px_rgba(86,80,162,0.18)]",
                        state === "next" && "bg-[rgba(22,21,43,0.18)]"
                      )}
                    >
                      {state === "done" && <Check className="h-4 w-4" strokeWidth={3} />}
                      {state === "current" && (
                        <Spinner className="h-3 w-3 border-white/40 border-t-white" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-prism-label",
                        state === "done" && "text-prism-ink",
                        state === "current" && "font-bold text-prism-nav-pressed",
                        state === "next" && "font-medium text-prism-ink-2"
                      )}
                    >
                      {step.label}
                      {state === "done" && <span className="sr-only">, done</span>}
                    </span>
                  </li>
                );
              })}
            </ol>

            {currentEvent && !isCompleted && (
              <div aria-live="polite">
                <Rows
                  rows={[
                    ["Stakes found", count(currentEvent.stakesFound)],
                    ["Unstakes found", count(currentEvent.unstakesFound)],
                    ["New stakes", count(currentEvent.stakesProcessed)],
                    ["New unstakes", count(currentEvent.unstakesProcessed)],
                    [
                      "Already indexed",
                      count(
                        currentEvent.stakesAlreadyIndexed + currentEvent.unstakesAlreadyIndexed
                      ),
                    ],
                    [
                      "Unknown wallets skipped",
                      count(currentEvent.stakesSkipped + currentEvent.unstakesSkipped),
                    ],
                  ]}
                />
              </div>
            )}

            {isCompleted && summary && (
              <div className="space-y-3" aria-live="polite">
                <h3 className="text-prism-label font-bold text-prism-ink">Summary</h3>
                {summary.scope && (
                  <>
                    <p className="text-prism-eyebrow uppercase text-prism-ink-2">Scope</p>
                    <Rows
                      rows={[
                        ["Network", summary.scope.chainName],
                        ["From block", Number(summary.scope.creationBlock).toLocaleString("en-US")],
                        ["To block", Number(summary.scope.latestBlock).toLocaleString("en-US")],
                        [
                          "Blocks scanned",
                          Number(summary.scope.totalBlocks).toLocaleString("en-US"),
                        ],
                      ]}
                    />
                  </>
                )}
                <p className="text-prism-eyebrow uppercase text-prism-ink-2">Events</p>
                <Rows
                  rows={[
                    [
                      "On chain events",
                      count(
                        summary.totalOnChainEvents ??
                          summary.stakes.processed +
                            summary.unstakes.processed +
                            summary.stakes.alreadyIndexed +
                            summary.unstakes.alreadyIndexed +
                            summary.stakes.skipped +
                            summary.unstakes.skipped
                      ),
                    ],
                    ["New stakes", count(summary.stakes.processed)],
                    ["New unstakes", count(summary.unstakes.processed)],
                  ]}
                />
                <p className="text-prism-eyebrow uppercase text-prism-ink-2">Wallet match</p>
                <Rows
                  rows={[
                    ["Unique addresses", count(summary.uniqueOnChainAddresses)],
                    [
                      "Already indexed",
                      count(summary.stakes.alreadyIndexed + summary.unstakes.alreadyIndexed),
                    ],
                    [
                      "Unknown wallets skipped",
                      count(
                        summary.unknownAddressCount ??
                          summary.stakes.skipped + summary.unstakes.skipped
                      ),
                    ],
                  ]}
                />
                {(summary.unknownAddressCount ?? 0) > 0 && (
                  <p className="text-prism-meta text-prism-ink-2">
                    Skipped wallets are not on Amped.Bio yet. Their stakes appear once they connect
                    the wallet.
                  </p>
                )}
                <p className="text-prism-eyebrow uppercase text-prism-ink-2">Pool final state</p>
                <Rows
                  rows={[
                    ["Active fans", count(summary.fansCount)],
                    ["Total staked", `${formatTokens(summary.totalStaked)} ${symbol}`],
                    ...(summary.zeroBalanceCount !== undefined
                      ? ([
                          ["Fully unstaked, kept for history", count(summary.zeroBalanceCount)],
                        ] as [string, string][])
                      : []),
                  ]}
                />
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <Button variant={isCompleted ? "default" : "secondary"} onClick={handleClose}>
            {isCompleted ? "Done" : error ? "Close" : "Cancel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

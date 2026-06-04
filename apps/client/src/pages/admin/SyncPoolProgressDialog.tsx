import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { trpcClient } from "../../utils/trpc/trpc";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Database,
  Search,
  Wallet,
  FileCheck,
  BarChart3,
  XCircle,
} from "lucide-react";

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
  onComplete: () => void;
}

interface StepInfo {
  label: string;
  icon: React.ReactNode;
  phase: SyncProgressEvent["phase"];
}

const STEPS: StepInfo[] = [
  { label: "Finding pool in database", icon: <Database className="h-4 w-4" />, phase: "init" },
  { label: "Connecting to blockchain", icon: <Database className="h-4 w-4" />, phase: "init" },
  { label: "Fetching creation block", icon: <Search className="h-4 w-4" />, phase: "init" },
  { label: "Scanning Stake events", icon: <Search className="h-4 w-4" />, phase: "scanning" },
  { label: "Scanning Unstake events", icon: <Search className="h-4 w-4" />, phase: "scanning" },
  { label: "Decoding events", icon: <FileCheck className="h-4 w-4" />, phase: "processing" },
  { label: "Looking up wallets", icon: <Wallet className="h-4 w-4" />, phase: "processing" },
  { label: "Checking duplicates", icon: <FileCheck className="h-4 w-4" />, phase: "processing" },
  { label: "Writing to database", icon: <Database className="h-4 w-4" />, phase: "writing" },
  { label: "Recalculating pool totals", icon: <BarChart3 className="h-4 w-4" />, phase: "finalizing" },
];

export default function SyncPoolProgressDialog({
  isOpen,
  onClose,
  poolId,
  onComplete,
}: SyncPoolProgressDialogProps) {
  const [currentEvent, setCurrentEvent] = useState<SyncProgressEvent | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const abortRef = useRef<(() => void) | null>(null);
  const completedCalled = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCloseRef = useRef(onClose);
  const mountedRef = useRef(true);

  // Keep refs in sync without triggering re-subscriptions
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Reset state
    setCurrentEvent(null);
    setIsCompleted(false);
    setError(null);
    setIsConnecting(true);
    completedCalled.current = false;
    mountedRef.current = true;

    const subscription = trpcClient.admin.pools.syncPool.subscribe(
      { poolId },
      {
        onData(event: any) {
          if (!mountedRef.current) return;

          // tRPC SSE delivers tracked data directly; mockLink wraps in result.data
          const data = (event as any).result?.data ?? (event as any).data ?? event;
          setIsConnecting(false);
          setCurrentEvent(data);

          if (data.phase === "complete") {
            setIsCompleted(true);
            // Immediately close the SSE connection to prevent browser EventSource reconnection
            abortRef.current?.();
            if (!completedCalled.current) {
              completedCalled.current = true;
              // Defer refetch outside SSE event handler to avoid React state conflicts
              setTimeout(() => {
                if (mountedRef.current) {
                  onCompleteRef.current();
                }
              }, 0);
            }
          }

          if (data.phase === "error") {
            setError(data.message || "Sync failed");
          }
        },
        onError(err) {
          if (!mountedRef.current) return;
          console.error("Subscription error:", err);
          setIsConnecting(false);
          setError(err.message || "Connection error");
        },
        onComplete() {
          if (!mountedRef.current) return;
          setIsConnecting(false);
        },
      }
    );

    abortRef.current = () => subscription.unsubscribe();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [isOpen, poolId]); // Removed onComplete/onClose from deps to prevent re-subscription loop

  const handleClose = () => {
    abortRef.current?.();
    onCloseRef.current();
  };

  const getStepStatus = (index: number) => {
    if (!currentEvent && !isCompleted) {
      return index === 0 ? "active" : "pending";
    }

    if (isCompleted) return "completed";

    const phaseOrder: Record<string, number> = {
      init: 0,
      scanning: 1,
      processing: 2,
      writing: 3,
      finalizing: 4,
      complete: 5,
    };

    const currentPhaseIndex = phaseOrder[currentEvent?.phase ?? "init"];
    const stepPhaseIndex = phaseOrder[STEPS[index]?.phase ?? "init"];

    if (stepPhaseIndex < currentPhaseIndex) return "completed";
    if (stepPhaseIndex === currentPhaseIndex) return "active";
    return "pending";
  };

  const getProgressPercent = () => {
    if (currentEvent?.percent) return currentEvent.percent;
    if (isCompleted) return 100;
    if (currentEvent?.phase === "processing" || currentEvent?.phase === "finalizing") return 95;
    if (currentEvent?.phase === "writing") return 97;
    return 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Syncing Pool #{poolId}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Progress bar */}
          {!error && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{isCompleted ? "Completed" : "Syncing..."}</span>
                <span>{getProgressPercent()}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ease-out ${
                    error
                      ? "bg-red-500"
                      : isCompleted
                        ? "bg-green-500"
                        : "bg-blue-500"
                  }`}
                  style={{ width: `${getProgressPercent()}%` }}
                />
              </div>
            </div>
          )}

          {/* Connecting state */}
          {isConnecting && !error && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Connecting to server...</span>
            </div>
          )}

          {/* Step list */}
          {!error && !isConnecting && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {STEPS.map((step, index) => {
                const status = getStepStatus(index);
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      status === "active"
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : status === "completed"
                          ? "text-green-700 dark:text-green-300"
                          : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : status === "active" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </div>
                    <span className="flex-shrink-0">{step.icon}</span>
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live counters */}
          {currentEvent && currentEvent.phase !== "init" && !error && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {currentEvent.stakesFound > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                  <span className="text-gray-500 dark:text-gray-400">Stakes Found:</span>
                  <span className="ml-1 font-semibold text-blue-600">{currentEvent.stakesFound}</span>
                </div>
              )}
              {currentEvent.unstakesFound > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                  <span className="text-gray-500 dark:text-gray-400">Unstakes Found:</span>
                  <span className="ml-1 font-semibold text-orange-600">{currentEvent.unstakesFound}</span>
                </div>
              )}
              {currentEvent.stakesProcessed > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                  <span className="text-gray-500 dark:text-gray-400">Stakes New:</span>
                  <span className="ml-1 font-semibold text-green-600">{currentEvent.stakesProcessed}</span>
                </div>
              )}
              {currentEvent.unstakesProcessed > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                  <span className="text-gray-500 dark:text-gray-400">Unstakes New:</span>
                  <span className="ml-1 font-semibold text-red-600">{currentEvent.unstakesProcessed}</span>
                </div>
              )}
              {currentEvent.stakesAlreadyIndexed > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                  <span className="text-gray-500 dark:text-gray-400">Already Indexed:</span>
                  <span className="ml-1 font-semibold text-yellow-600">{currentEvent.stakesAlreadyIndexed + currentEvent.unstakesAlreadyIndexed}</span>
                </div>
              )}
              {currentEvent.stakesSkipped > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                  <span className="text-gray-500 dark:text-gray-400">Skipped (unknown):</span>
                  <span className="ml-1 font-semibold text-gray-600">{currentEvent.stakesSkipped + currentEvent.unstakesSkipped}</span>
                </div>
              )}
            </div>
          )}

          {/* Current message */}
          {currentEvent && !error && (
            <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-md p-3">
              {currentEvent.phase === "complete" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0 mt-0.5" />
              )}
              <span>{currentEvent.message}</span>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md p-3">
              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Summary when complete */}
          {isCompleted && currentEvent?.summary && (
            <div className="space-y-3 border-t pt-3 mt-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sync Summary</h4>

              {/* Section 0: Sync Scope */}
              {currentEvent.summary.scope && (
                <div>
                  <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Sync Scope</h5>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5">
                      <span className="text-gray-500 dark:text-gray-400">Chain:</span>
                      <span className="ml-1 font-semibold">{currentEvent.summary.scope.chainName} ({currentEvent.summary.scope.chainId})</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5">
                      <span className="text-gray-500 dark:text-gray-400">Creation Tx:</span>
                      <span className="ml-1 font-semibold font-mono text-[10px]">{currentEvent.summary.scope.creationTxid.slice(0, 10)}...{currentEvent.summary.scope.creationTxid.slice(-8)}</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5">
                      <span className="text-gray-500 dark:text-gray-400">From Block:</span>
                      <span className="ml-1 font-semibold">{Number(currentEvent.summary.scope.creationBlock).toLocaleString()}</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5">
                      <span className="text-gray-500 dark:text-gray-400">To Block:</span>
                      <span className="ml-1 font-semibold">{Number(currentEvent.summary.scope.latestBlock).toLocaleString()}</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5 col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">Blocks Scanned:</span>
                      <span className="ml-1 font-semibold">{Number(currentEvent.summary.scope.totalBlocks).toLocaleString()}</span>
                      <span className="text-gray-400 ml-1">(chunks of {currentEvent.summary.scope.blockRange})</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 1: Event Activity */}
              <div>
                <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Event Activity</h5>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">On-Chain Events:</span>
                    <span className="ml-1 font-semibold">{currentEvent.summary.totalOnChainEvents ?? (currentEvent.summary.stakes.processed + currentEvent.summary.unstakes.processed + currentEvent.summary.stakes.alreadyIndexed + currentEvent.summary.unstakes.alreadyIndexed + currentEvent.summary.stakes.skipped + currentEvent.summary.unstakes.skipped)}</span>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Unique Addresses:</span>
                    <span className="ml-1 font-semibold">{currentEvent.summary.uniqueOnChainAddresses ?? "?"}</span>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Stakes New:</span>
                    <span className="ml-1 font-semibold text-green-700 dark:text-green-300">{currentEvent.summary.stakes.processed}</span>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Unstakes New:</span>
                    <span className="ml-1 font-semibold text-red-700 dark:text-red-300">{currentEvent.summary.unstakes.processed}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Address Match Status */}
              <div>
                <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Wallet Match Status</h5>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Already Indexed:</span>
                    <span className="ml-1 font-semibold text-yellow-700 dark:text-yellow-300">
                      {currentEvent.summary.stakes.alreadyIndexed + currentEvent.summary.unstakes.alreadyIndexed}
                    </span>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Unknown Wallets:</span>
                    <span className="ml-1 font-semibold text-orange-700 dark:text-orange-300">{currentEvent.summary.unknownAddressCount ?? (currentEvent.summary.stakes.skipped + currentEvent.summary.unstakes.skipped)}</span>
                  </div>
                </div>
                {(currentEvent.summary.unknownAddressCount ?? 0) > 0 && (
                  <div className="mt-1.5 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/10 rounded-md p-2">
                    <strong>⚠️ {(currentEvent.summary.stakes.skipped + currentEvent.summary.unstakes.skipped)} events skipped</strong> — {currentEvent.summary.unknownAddressCount} addresses are not registered in amped.bio. These stakers won't appear in wallet views until they connect their wallet.
                  </div>
                )}
              </div>

              {/* Section 3: Pool Final State */}
              <div>
                <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Pool Final State</h5>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Active Fans:</span>
                    <span className="ml-1 font-semibold text-blue-700 dark:text-blue-300">{currentEvent.summary.fansCount}</span>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Total Staked:</span>
                    <span className="ml-1 font-semibold text-blue-700 dark:text-blue-300">{currentEvent.summary.totalStaked} REVO</span>
                  </div>
                  {currentEvent.summary.zeroBalanceCount !== undefined && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-1.5 col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">Zero-Balance Records:</span>
                      <span className="ml-1 font-semibold">{currentEvent.summary.zeroBalanceCount}</span>
                      <span className="block text-gray-400 mt-0.5 text-[10px]">(unstaked completely — kept for history)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant={isCompleted ? "default" : "outline"}
            onClick={handleClose}
          >
            {isCompleted ? "Done" : error ? "Close" : "Cancel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, ErrorCard, Skeleton, trpc, trpcClient } from "@repo/ui";
import { CopyButton } from "../../kit/CopyButton";
import { ConfirmDialog, retryToast } from "../../kit/parts";
import { WordBadge } from "../../kit/WordBadge";
import { formatCount, shortHex } from "../../kit/format";

// Screen Review 087 I08. The faucet is a platform wide money setting, so it
// changes through an explicit button (087 D1), never an instant switch.
// Turning it off asks first in the shared Dialog.

// The existing low mark: under 50 airdrops left was already the warning tier
const LOW_AIRDROPS = 50;

interface ChainBalance {
  chainId: number;
  chainName: string;
  currency: string;
  formattedBalance: string;
}

interface FaucetInfo {
  success: true;
  address: string;
  faucetAmount: string | number;
  isMockMode?: boolean;
  balances: ChainBalance[];
}

function tokens(wei: string): number | null {
  const value = Number(wei);
  return Number.isFinite(value) ? value / 1e18 : null;
}

export function FaucetCard() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const wallet = useQuery(trpc.admin.wallet.getFaucetWalletInfo.queryOptions());
  const status = useQuery(trpc.admin.settings.getFaucetStatus.queryOptions());

  const setStatus = useMutation({
    mutationFn: (enabled: boolean) => trpcClient.admin.settings.setFaucetStatus.mutate({ enabled }),
    onSuccess: (_data, enabled) => {
      setConfirmOpen(false);
      toast.success(enabled ? "Faucet turned on" : "Faucet turned off");
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.settings.getFaucetStatus.queryKey(),
      });
    },
    onError: (_error, enabled) => {
      setConfirmOpen(false);
      retryToast(enabled ? "The faucet did not turn on" : "The faucet did not turn off", () =>
        setStatus.mutate(enabled)
      );
    },
  });

  const info =
    wallet.data && "success" in wallet.data && wallet.data.success
      ? (wallet.data as unknown as FaucetInfo)
      : null;
  const walletFailed = wallet.isError || (wallet.data && !info);
  const on = status.data === true;
  const perDrop = info ? Number(info.faucetAmount) : NaN;

  return (
    <section
      aria-labelledby="faucet-title"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-5 font-prism"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="faucet-title" className="text-prism-panel-title text-prism-ink">
          Faucet
        </h3>
        {status.isPending ? (
          <Skeleton delayMs={400} className="h-5 w-28" />
        ) : status.isError ? (
          <span className="text-prism-meta text-prism-danger">Status did not load</span>
        ) : (
          <p className="flex items-center gap-2 text-prism-label font-semibold text-prism-ink">
            {on ? (
              <CheckCircle2 aria-hidden className="h-5 w-5 text-prism-success" />
            ) : (
              <CircleSlash aria-hidden className="h-5 w-5 text-prism-ink-2" />
            )}
            {on ? "Faucet is on" : "Faucet is off"}
          </p>
        )}
      </div>

      {wallet.isPending ? (
        <div aria-busy className="space-y-2">
          <Skeleton delayMs={400} className="h-4 w-48" />
          <Skeleton delayMs={400} className="h-24 w-full !rounded-prism-21" />
        </div>
      ) : walletFailed || !info ? (
        <ErrorCard
          title="Faucet wallet did not load"
          cause="The balances could not be read. Try again."
          retryLabel="Retry"
          onRetry={() => void wallet.refetch()}
        />
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-prism-meta text-prism-ink-2">
            Faucet wallet
            <span className="font-prism-mono text-prism-code-sm font-semibold text-prism-ink">
              {shortHex(info.address)}
            </span>
            <CopyButton value={info.address} label="Copy faucet wallet address" size="inline" />
            {info.isMockMode && <WordBadge tone="warning">Mock mode, nothing is sent</WordBadge>}
          </p>
          <div className="prism-slab overflow-x-auto">
            <table aria-label="Faucet balance per network" className="w-full text-left">
              <thead>
                <tr className="h-touch text-prism-eyebrow uppercase text-prism-ink-2">
                  <th scope="col" className="px-4 font-semibold">
                    Network
                  </th>
                  <th scope="col" className="px-4 text-right font-semibold">
                    Balance
                  </th>
                  <th scope="col" className="px-4 text-right font-semibold">
                    Airdrops left
                  </th>
                </tr>
              </thead>
              <tbody>
                {info.balances.map(balance => {
                  const amount = tokens(balance.formattedBalance);
                  const left =
                    amount === null || !Number.isFinite(perDrop) || perDrop <= 0
                      ? null
                      : Math.floor(amount / perDrop);
                  return (
                    <tr key={balance.chainId} className="h-touch border-t border-prism-line">
                      <td className="whitespace-nowrap px-4 text-prism-label text-prism-ink">
                        {balance.chainName}
                      </td>
                      <td className="whitespace-nowrap px-4 text-right text-prism-label tabular-nums text-prism-ink">
                        {amount === null
                          ? "Not available"
                          : `${amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${balance.currency}`}
                      </td>
                      <td className="whitespace-nowrap px-4 text-right text-prism-label tabular-nums text-prism-ink">
                        <span className="inline-flex items-center gap-2">
                          {left === null ? "Not available" : formatCount(left)}
                          {left !== null && left < LOW_AIRDROPS && (
                            <WordBadge tone="warning">Low</WordBadge>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {info.balances.length === 0 && (
                  <tr className="h-touch border-t border-prism-line">
                    <td colSpan={3} className="px-4 text-prism-label text-prism-ink-2">
                      No network balances yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <p className="text-prism-meta text-prism-ink-2">
          {Number.isFinite(perDrop)
            ? `Each airdrop sends ${perDrop} ${info?.balances[0]?.currency ?? "tREVO"}. Low under ${LOW_AIRDROPS} airdrops left.`
            : `Low under ${LOW_AIRDROPS} airdrops left.`}
        </p>
        <Button
          variant="secondary"
          disabled={status.isPending || status.isError || setStatus.isPending}
          aria-busy={setStatus.isPending || undefined}
          onClick={() => (on ? setConfirmOpen(true) : setStatus.mutate(true))}
        >
          {on ? "Turn off faucet" : "Turn on faucet"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Turn off the faucet?"
        body="Creators cannot claim tREVO until you turn it back on."
        confirmLabel="Turn off faucet"
        busy={setStatus.isPending}
        onConfirm={() => setStatus.mutate(false)}
      />
    </section>
  );
}

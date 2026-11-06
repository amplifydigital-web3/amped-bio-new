import { useSearchParams } from "react-router";
import { ChevronRight, CircleDollarSign, Coins } from "lucide-react";
import { USDC_SYMBOL, formatUsdc, getCurrencySymbol } from "@repo/web3";
import { Button, EmptyState, ErrorCard, Skeleton } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { appChainId } from "@/utils/appChain";
import { USDC_FLAGS } from "@/config/usdc/flags";
import { paymentChain } from "@/utils/paymentChain";
import { useUsdcBalance } from "../../hooks/useUsdcBalance";
import { formatTokenAmount } from "../../../explore/pool-panel/format";

function TokenMark() {
  return (
    <span
      aria-hidden
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFFFFF_0%,#F1F0F9_100%)] shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]"
    >
      <Coins className="h-[18px] w-[18px] text-prism-nav-pressed" strokeWidth={1.75} />
    </span>
  );
}

function UsdcMark() {
  return (
    <span
      aria-hidden
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFFFFF_0%,#F1F0F9_100%)] shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]"
    >
      <CircleDollarSign className="h-[18px] w-[18px] text-prism-value-ink" strokeWidth={1.75} />
    </span>
  );
}

/**
 * Screen Review 137 (board w1). The USDC row on the payment chain, first in
 * the list, with the network under the symbol. Opens Activity filtered to USDC.
 */
function UsdcRow({ address, onOpen }: { address: `0x${string}`; onOpen: () => void }) {
  const balance = useUsdcBalance(address);
  const amount = balance.data !== undefined ? formatUsdc(balance.data) : null;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${USDC_SYMBOL} on ${paymentChain.name}, ${amount ?? "loading"} ${USDC_SYMBOL}. Open activity`}
        className="prism-focus group -mx-2 flex h-commit w-[calc(100%+16px)] items-center gap-[13px] rounded-prism-13 px-2 text-left transition-colors duration-prism-hover ease-prism hover:bg-white/50 motion-reduce:transition-none"
      >
        <UsdcMark />
        <span className="min-w-0 flex-1">
          <span className="block text-prism-label font-semibold text-prism-ink">{USDC_SYMBOL}</span>
          <span className="block truncate text-prism-meta text-prism-ink-2">
            {paymentChain.name} · Circle
          </span>
        </span>
        <span className="shrink-0 text-prism-label font-semibold tabular-nums text-prism-ink">
          {amount === null ? (
            <Skeleton className="h-4 w-[89px] rounded-prism-5" />
          ) : (
            `${amount} ${USDC_SYMBOL}`
          )}
        </span>
        <ChevronRight aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
      </button>
    </li>
  );
}

function TokenRowSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading your tokens"
      className="prism-glass-clear !rounded-prism-21 px-[21px] py-2"
    >
      <div className="flex h-commit items-center gap-[13px]">
        <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-[55px] rounded-prism-5" />
          <Skeleton className="h-3 w-[160px] rounded-prism-5" />
        </div>
        <Skeleton className="h-4 w-[89px] rounded-prism-5" />
      </div>
    </div>
  );
}

/**
 * Screen Review 055. The Tokens view: one G0 row 55 per token on a G1 clear
 * card. USDC comes first when it is on (137), then the native token. The row
 * opens Activity for that token. No fiat value is shown for tREVO. Loading,
 * zero and error follow the shared conventions.
 */
export default function TokensTab() {
  const { setActivePanelAndNavigate } = useEditor();
  const { balance, address } = useWalletContext();
  const [, setParams] = useSearchParams();
  const symbol = getCurrencySymbol(Number(appChainId()));
  const loading = !address || !!balance?.isLoading;
  const showSkeleton = useDelayed(loading, 400);

  if (balance?.isError) {
    return (
      <ErrorCard
        title="Balance did not load"
        cause="Check your connection and retry."
        retryLabel="Retry"
        onRetry={() => void balance.refetch()}
        className="!rounded-prism-21"
      />
    );
  }

  if (loading) return showSkeleton ? <TokenRowSkeleton /> : null;

  // 055 I03, QA-048: the same rounded down figure as the wallet header
  const amount = balance?.data ? formatTokenAmount(balance.data.value) : "0";
  const zero = !balance?.data || balance.data.value === 0n;

  const openActivity = (token: string = symbol) =>
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.set("tab", "activity");
        next.set("token", token);
        return next;
      },
      { replace: true }
    );

  return (
    <div className="space-y-[21px] font-prism">
      <ul
        aria-label="Tokens"
        className="prism-glass-clear !rounded-prism-21 divide-y divide-prism-line px-[21px] py-2"
      >
        {USDC_FLAGS.wallet && address && (
          <UsdcRow address={address} onOpen={() => openActivity(USDC_SYMBOL)} />
        )}
        <li>
          <button
            type="button"
            onClick={() => openActivity()}
            aria-label={`${symbol}, Revolution Chain native token, ${amount} ${symbol}. Open activity`}
            className="prism-focus group -mx-2 flex h-commit w-[calc(100%+16px)] items-center gap-[13px] rounded-prism-13 px-2 text-left transition-colors duration-prism-hover ease-prism hover:bg-white/50 motion-reduce:transition-none"
          >
            <TokenMark />
            <span className="min-w-0 flex-1">
              <span className="block text-prism-label font-semibold text-prism-ink">{symbol}</span>
              <span className="block truncate text-prism-meta text-prism-ink-2">
                Revolution Chain native token
              </span>
            </span>
            <span className="shrink-0 text-prism-label font-semibold tabular-nums text-prism-ink">
              {amount} {symbol}
            </span>
            <ChevronRight aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
          </button>
        </li>
      </ul>

      {zero && (
        <EmptyState
          icon={Coins}
          title={`No ${symbol} yet`}
          description={`Request testnet ${symbol} from the faucet or receive it from another creator.`}
          // 055 I06: Get tREVO opens the Daily faucet card, now on Home
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActivePanelAndNavigate("home", undefined, { open: "faucet" })}
            >
              Get {symbol}
            </Button>
          }
        />
      )}
    </div>
  );
}

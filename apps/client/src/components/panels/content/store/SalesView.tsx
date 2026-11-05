/**
 * Store tab, Sales (content PR C10, Screen Review row 161, boards st5, k2a and k2b).
 * This month after fees, every sale with Pending until final then Final, Refund in the
 * row menu, and the month's CSV with the store policy version for each sale. Prism
 * surfaces; the refund sheet is a calm value panel because it commits money.
 */
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Download, MoreHorizontal, ReceiptText } from "lucide-react";
import { REFUND_TYPES, USDC_PERMIT_TYPES } from "@repo/web3";
import {
  STORE_SALES_COPY,
  recentSalesMonths,
  salesMonthLabel,
  usdcDollarsLabel,
  type RefundQuote,
  type SaleRow,
  type SaleState,
} from "@repo/constants";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Notice,
  Skeleton,
  cn,
  queryClient,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { paymentChain } from "@/utils/paymentChain";
import { classifyTxError } from "../../explore/pool-panel/format";
import { usePaymentChainSigner } from "../../wallet/send/useUsdcSigner";

const S = STORE_SALES_COPY;

const STATE_TONE: Record<SaleState, string> = {
  pending: "bg-prism-warning-bg text-prism-warning-ink",
  final: "bg-prism-nav-tint text-prism-ink",
  refunding: "bg-prism-warning-bg text-prism-warning-ink",
  refunded: "bg-prism-line text-prism-ink-2",
};

export function buyerLabel(row: Pick<SaleRow, "buyer">) {
  return row.buyer?.name?.trim() || (row.buyer?.handle ? `@${row.buyer.handle}` : S.someone);
}

function txUrl(hash: string) {
  const base = paymentChain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

function StateLabel({ state }: { state: SaleState }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[13px] font-semibold",
        STATE_TONE[state]
      )}
    >
      {S.states[state]}
    </span>
  );
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Saves text as a file through a short lived object URL. */
function saveText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SalesView() {
  const navigate = useNavigate();
  const [refundFor, setRefundFor] = useState<SaleRow | null>(null);
  const months = useMemo(() => recentSalesMonths(new Date()), []);
  const [month, setMonth] = useState(months[0]!);
  const list = useInfiniteQuery(
    trpc.store.sales.list.infiniteQueryOptions(
      {},
      { getNextPageParam: last => last.nextCursor ?? undefined }
    )
  );
  const rows = useMemo(() => list.data?.pages.flatMap(p => p.rows) ?? [], [list.data]);
  const totals = list.data?.pages[0]?.totals;
  const skeleton = useDelayed(list.isLoading, 400);

  const exportCsv = useMutation({
    mutationFn: () => trpcClient.store.sales.csv.query({ month }),
    onSuccess: ({ csv, month: m }) => {
      if (csv.trim().split("\r\n").length <= 1) {
        toast.add({ type: "info", title: S.exportEmpty });
        return;
      }
      saveText(`amped-sales-${m}.csv`, csv);
    },
    onError: () => toast.add({ type: "error", title: S.errorTitle }),
  });

  if (list.isLoading) {
    return skeleton ? (
      <div aria-busy aria-label={S.loading} className="space-y-3">
        <Skeleton className="h-[89px] w-full rounded-prism-21" />
        {[0, 1, 2].map(i => (
          <Skeleton key={i} className="h-[72px] w-full rounded-prism-13" />
        ))}
      </div>
    ) : null;
  }
  if (list.isError) {
    return (
      <ErrorCard title={S.errorTitle} cause={S.errorCause} onRetry={() => void list.refetch()} />
    );
  }

  return (
    <div className="space-y-[21px]">
      <section
        aria-label={S.title}
        className="prism-value-panel flex flex-wrap items-end justify-between gap-[13px] rounded-prism-21 p-[21px]"
      >
        <div>
          <p className="text-prism-label text-prism-value-ink/80">{S.netThisMonth}</p>
          <p className="font-prism text-[32px] font-bold leading-tight tabular-nums text-prism-value-ink">
            {usdcDollarsLabel(totals?.netThisMonth ?? "0")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-prism-label text-prism-value-ink/80">{S.salesThisMonth}</p>
          <p className="font-prism text-[24px] font-bold tabular-nums text-prism-value-ink">
            {totals?.salesThisMonth ?? 0}
          </p>
        </div>
      </section>

      <section aria-label={S.exportCsv} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="sales-month" className="sr-only">
            {S.exportMonth}
          </label>
          <select
            id="sales-month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="prism-well prism-focus h-touch rounded-prism-13 px-3 text-prism-label text-prism-ink"
          >
            {months.map(m => (
              <option key={m} value={m}>
                {salesMonthLabel(m)}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending}
          >
            <Download aria-hidden />
            {S.exportCsv}
          </Button>
          <Button variant="link" onClick={() => navigate("/wallet?tab=activity")}>
            {S.walletActivity}
          </Button>
        </div>
        <p className="text-prism-meta text-prism-ink-2">{S.exportNote}</p>
      </section>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title={S.emptyTitle} description={S.empty} />
      ) : (
        <>
          {/* Phones: one row per sale (board k2a) */}
          <ul aria-label={S.title} className="space-y-1 md:hidden">
            {rows.map(row => (
              <li key={row.id}>
                <div className="flex min-h-[72px] items-center gap-2 rounded-prism-13 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-prism-label font-semibold text-prism-ink">
                      {buyerLabel(row)}
                    </p>
                    <p className="truncate text-prism-meta text-prism-ink-2">
                      {row.buyer?.handle ? `@${row.buyer.handle}, ` : ""}
                      {row.title}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-prism text-prism-label font-semibold tabular-nums text-prism-ink">
                      {usdcDollarsLabel(row.amount)}
                    </span>
                    <StateLabel state={row.state} />
                  </div>
                  <RowMenu row={row} onRefund={() => setRefundFor(row)} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: the st5 table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-prism-meta">
              <thead>
                <tr className="text-prism-ink-2">
                  {(
                    [
                      "buyer",
                      "product",
                      "amount",
                      "fee",
                      "promoter",
                      "net",
                      "date",
                      "status",
                    ] as const
                  ).map(key => (
                    <th key={key} scope="col" className="px-2 py-2 font-semibold">
                      {S.columns[key]}
                    </th>
                  ))}
                  <th scope="col" className="w-touch px-2 py-2">
                    <span className="sr-only">{S.refund}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-prism-line">
                    <td className="px-2 py-2">
                      <span className="block font-semibold text-prism-ink">{buyerLabel(row)}</span>
                      {row.buyer?.handle && (
                        <span className="block text-prism-ink-2">@{row.buyer.handle}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-prism-ink">{row.title}</td>
                    <td className="px-2 py-2 tabular-nums text-prism-ink">
                      {usdcDollarsLabel(row.amount)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-prism-ink-2">
                      {usdcDollarsLabel(row.fee)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-prism-ink-2">
                      {row.promoter ? usdcDollarsLabel(row.promoter) : ""}
                    </td>
                    <td className="px-2 py-2 font-semibold tabular-nums text-prism-ink">
                      {usdcDollarsLabel(row.net)}
                    </td>
                    <td className="px-2 py-2 text-prism-ink-2">{dateLabel(row.paidAt)}</td>
                    <td className="px-2 py-2">
                      <StateLabel state={row.state} />
                    </td>
                    <td className="px-2 py-2">
                      <RowMenu row={row} onRefund={() => setRefundFor(row)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {list.isFetchingNextPage ? S.loading : S.showMore}
              </Button>
            </div>
          )}
        </>
      )}

      <RefundSheet
        sale={refundFor}
        windowDays={list.data?.pages[0]?.refundWindowDays ?? 30}
        onClose={() => setRefundFor(null)}
      />
    </div>
  );
}

function RowMenu({ row, onRefund }: { row: SaleRow; onRefund: () => void }) {
  const url = row.txHash ? txUrl(row.txHash) : null;
  if (!row.refundable && !url) return <span className="w-touch shrink-0" aria-hidden />;
  return (
    <Menu>
      <MenuTrigger
        aria-label={S.rowMenu(buyerLabel(row))}
        className="prism-icon-btn prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-full"
      >
        <MoreHorizontal aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
      </MenuTrigger>
      <MenuContent align="end">
        {row.refundable && <MenuItem onSelect={onRefund}>{S.refund}</MenuItem>}
        {url && (
          <MenuItem onSelect={() => window.open(url, "_blank", "noopener,noreferrer")}>
            {S.viewTx}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

type Phase = "idle" | "signing" | "sending";

/** The refund sheet (board k2b): store policy summary, the figures, one commit button. */
function RefundSheet({
  sale,
  windowDays,
  onClose,
}: {
  sale: SaleRow | null;
  windowDays: number;
  onClose: () => void;
}) {
  const sign = usePaymentChainSigner();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const prepare = useMutation({
    ...trpc.store.sales.refund.prepare.mutationOptions(),
  });
  const submit = useMutation({ ...trpc.store.sales.refund.submit.mutationOptions() });
  const [prepared, setPrepared] = useState<string | null>(null);

  // Ask for the quote when the sheet opens for a sale
  const { mutate: ask } = prepare;
  useEffect(() => {
    if (!sale || prepared === sale.id) return;
    setPrepared(sale.id);
    setError(null);
    ask({ purchaseId: sale.id });
  }, [sale, prepared, ask]);
  const result = prepare.data;
  const quote: RefundQuote | null = result && !result.refused ? result.quote : null;
  const refusal =
    result && result.refused
      ? refusalLine(result.reason, result.shortBy, windowDays)
      : prepare.isError
        ? S.refusals.relayer
        : null;

  const close = () => {
    setPrepared(null);
    setPhase("idle");
    setError(null);
    prepare.reset();
    onClose();
  };

  const commit = async () => {
    if (!quote) return;
    setError(null);
    setPhase("signing");
    try {
      const t = quote.typed;
      const refundSignature = await sign({
        account: quote.signer,
        domain: t.refund.domain,
        types: REFUND_TYPES,
        primaryType: "Refund",
        message: {
          paymentRef: t.refund.message.paymentRef,
          deadline: BigInt(t.refund.message.deadline),
        },
      });
      const permitSignature = await sign({
        account: quote.signer,
        domain: t.permit.domain,
        types: USDC_PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: t.permit.message.owner,
          spender: t.permit.message.spender,
          value: BigInt(t.permit.message.value),
          nonce: BigInt(t.permit.message.nonce),
          deadline: BigInt(t.permit.message.deadline),
        },
      });
      setPhase("sending");
      const sent = await submit.mutateAsync({
        purchaseId: quote.purchaseId,
        deadline: t.refund.message.deadline,
        refundSignature,
        permitDeadline: t.permit.message.deadline,
        permitSignature,
      });
      if (sent.refused) {
        setError(refusalLine(sent.reason, undefined, windowDays));
        setPhase("idle");
        return;
      }
      toast.add({ type: "success", title: S.sheet.done });
      void queryClient.invalidateQueries({ queryKey: trpc.store.sales.pathKey() });
      close();
    } catch (err) {
      setError(classifyTxError(err) === "rejected" ? S.refusals.rejected : S.refusals.relayer);
      setPhase("idle");
    }
  };

  const name = sale ? buyerLabel(sale) : "";
  return (
    <BottomSheet open={!!sale} onOpenChange={open => !open && close()}>
      <BottomSheetContent title={S.sheet.title(name)}>
        <div className="space-y-[13px] px-[21px] pb-[21px]">
          {prepare.isPending && !quote ? (
            <div aria-busy aria-label={S.loading} className="space-y-2">
              <Skeleton className="h-4 w-3/4 rounded-full" />
              <Skeleton className="h-[160px] w-full rounded-prism-21" />
            </div>
          ) : refusal ? (
            <>
              <Notice variant="warning">{refusal}</Notice>
              <Button variant="secondary" className="w-full" onClick={close}>
                {S.sheet.keep}
              </Button>
            </>
          ) : quote ? (
            <>
              <p className="text-prism-body text-prism-ink">
                {S.sheet.lead(quote.title, usdcDollarsLabel(quote.amount))}
              </p>
              <div className="rounded-prism-13 bg-prism-nav-tint p-[13px]">
                <p className="text-prism-meta font-semibold text-prism-ink">{S.sheet.policy}</p>
                <p className="text-prism-meta text-prism-ink">
                  {quote.policySummary ?? S.sheet.noPolicy}
                </p>
              </div>
              <dl className="prism-slab divide-y divide-prism-line rounded-prism-21 px-[13px]">
                {(
                  [
                    [S.sheet.fromWallet, quote.fromWallet],
                    [S.sheet.ampedReturns, quote.ampedReturns],
                    [S.sheet.buyerGets(quote.buyerName), quote.amount],
                    [S.sheet.balanceAfter, quote.balanceAfter],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex min-h-touch items-center justify-between gap-3">
                    <dt className="text-prism-meta text-prism-ink-2">{label}</dt>
                    <dd className="font-prism text-prism-label font-semibold tabular-nums text-prism-ink">
                      {usdcDollarsLabel(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              {BigInt(quote.notPulledBack) > 0n && (
                <Notice variant="info">
                  {S.sheet.notPulledBack(usdcDollarsLabel(quote.notPulledBack))}
                </Notice>
              )}
              {error && <Notice variant="warning">{error}</Notice>}
              <div className="flex flex-col gap-2">
                <Button
                  variant="commit"
                  size="lg"
                  className="w-full"
                  onClick={() => void commit()}
                  disabled={phase !== "idle"}
                >
                  {phase === "signing"
                    ? S.sheet.signing
                    : phase === "sending"
                      ? S.sheet.sending
                      : S.sheet.commit(usdcDollarsLabel(quote.amount))}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={close}
                  disabled={phase !== "idle"}
                >
                  {S.sheet.keep}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

export function refusalLine(reason: string, shortBy?: string, windowDays = 30): string {
  const r = S.refusals;
  switch (reason) {
    case "window_closed":
      return r.window_closed(windowDays);
    case "insufficient_balance":
      return r.insufficient_balance(usdcDollarsLabel(shortBy ?? "0"));
    case "not_found":
    case "not_refundable":
    case "already_refunded":
    case "paused":
    case "wallet_changed":
    case "signature":
    case "relayer":
      return r[reason];
    default:
      return r.relayer;
  }
}

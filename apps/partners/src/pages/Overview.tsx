import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { ErrorCard, trpc } from "@repo/ui";
import { formatBps } from "@repo/constants";
import { shortAddress, usdc, useMerchant } from "../merchant";
import { Badge, PageTitle, Panel } from "../parts";

// Board p1: what Authbase sold in the last 30 days, checks waiting, the payout wallet and setup.
export function Overview() {
  const merchant = useMerchant();
  const view = useQuery(trpc.merchant.console.overview.queryOptions({ merchantId: merchant.id }));
  if (view.isError)
    return <ErrorCard title="Overview did not load" onRetry={() => void view.refetch()} />;
  const d = view.data;
  return (
    <>
      <PageTitle>Overview</PageTitle>
      {d?.merchant?.status !== "active" && (
        <div
          role="note"
          className="rounded-prism-13 bg-prism-warning-bg p-[13px] text-prism-warning-ink"
        >
          <p className="font-semibold">Pending approval</p>
          <p className="text-prism-meta">
            Amped.Bio turns on payments after the business check. You can set up products and your
            payout wallet now.
          </p>
        </div>
      )}
      <div className="grid gap-[21px] md:grid-cols-3">
        <Panel title="Last 30 days">
          <p className="text-[34px] font-bold tabular-nums">
            {d ? usdc(d.last30.netUnits) : "..."}
          </p>
          <p className="text-prism-meta text-prism-ink-2">
            {d
              ? `${d.last30.orders} orders. ${usdc(d.last30.grossUnits)} paid by buyers, ${formatBps(d.merchant?.feeBps ?? 0)} Amped.Bio fee included.`
              : ""}
          </p>
        </Panel>
        <Panel title="Checks waiting">
          <p className="text-[34px] font-bold tabular-nums">{d?.openChecks ?? "..."}</p>
          <p className="text-prism-meta text-prism-ink-2">Paid orders with no finished check.</p>
          <NavLink
            to="/orders"
            className="prism-focus inline-flex min-h-touch items-center font-semibold text-prism-nav"
          >
            All orders
          </NavLink>
        </Panel>
        <Panel title="Payout wallet">
          <p className="font-mono text-prism-label">{shortAddress(d?.payoutWallet)}</p>
          {!d?.payoutWallet && <Badge tone="warn">To do</Badge>}
          <NavLink
            to="/payout-wallet"
            className="prism-focus inline-flex min-h-touch items-center font-semibold text-prism-nav"
          >
            Manage
          </NavLink>
        </Panel>
      </div>
    </>
  );
}

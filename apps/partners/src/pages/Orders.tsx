import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, ErrorCard, trpc } from "@repo/ui";
import { day, shortAddress, usdc, useMerchant } from "../merchant";
import { Badge, CodeField, Field, PageTitle, Panel, Table, td, th, tr } from "../parts";

// Board p4: orders and refunds. A refund returns the full amount to the buyer: the payout wallet
// signs the Refund and the permit for its share (in the wallet or the Safe), the treasury
// returns the Amped.Bio share in the same transaction (M6). Owners and Finance only.
type Filter = "all" | "paid" | "finalized" | "refunded";

const FULFILLMENT: Record<string, string> = {
  paid: "Check not started",
  started: "Check started",
  in_review: "In review",
  verified: "Verified",
  not_passed: "Not passed",
};

export function Orders() {
  const merchant = useMerchant();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const input = { merchantId: merchant.id, ...(filter !== "all" ? { status: filter } : {}) };
  const orders = useQuery(trpc.merchant.console.orders.queryOptions(input));
  const [refunding, setRefunding] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState<string>("");
  const [sigs, setSigs] = useState({ refund: "", permit: "" });
  const canRefund = merchant.role === "owner" || merchant.role === "finance";

  const prepare = useMutation({
    ...trpc.merchant.console.prepareRefund.mutationOptions(),
    onSuccess: data => setTyped(JSON.stringify(data, null, 2)),
    onError: error => toast.error(error.message),
  });
  const submit = useMutation({
    ...trpc.merchant.console.submitRefund.mutationOptions(),
    onSuccess: () => {
      toast.success("Refund sent. The buyer gets the full amount back when it lands.");
      setRefunding(null);
      setTyped("");
      setSigs({ refund: "", permit: "" });
      void queryClient.invalidateQueries({
        queryKey: trpc.merchant.console.orders.queryKey(input),
      });
    },
    onError: error => toast.error(error.message),
  });

  if (orders.isError)
    return <ErrorCard title="Orders did not load" onRetry={() => void orders.refetch()} />;
  const parsed = (() => {
    try {
      return typed
        ? (JSON.parse(typed) as {
            refund: { message: { deadline: string } };
            permit: { message: { deadline: string } };
          })
        : null;
    } catch {
      return null;
    }
  })();

  return (
    <>
      <PageTitle>Orders</PageTitle>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {(["all", "paid", "finalized", "refunded"] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? "default" : "secondary"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "paid" ? "Paid" : f === "finalized" ? "Final" : "Refunded"}
          </Button>
        ))}
      </div>
      <Table label="Orders">
        <thead>
          <tr>
            <th className={th}>Order</th>
            <th className={th}>Check</th>
            <th className={th}>Paid</th>
            <th className={th}>You receive</th>
            <th className={th}>Wallet</th>
            <th className={th}>Status</th>
            <th className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(orders.data?.data ?? []).map(o => (
            <tr key={o.order_ref} className={tr}>
              <td className={`${td} font-mono text-prism-label`}>
                {o.order_ref.slice(0, 8)}
                <span className="block font-sans text-prism-meta text-prism-ink-2">
                  {day(o.paid_at)}
                </span>
              </td>
              <td className={td}>{o.product_code}</td>
              <td className={td}>{usdc(o.amount_units)}</td>
              <td className={td}>
                {usdc(o.shares.find(s => s.role === "merchant")?.amount_units ?? "0")}
              </td>
              <td className={`${td} font-mono text-prism-label`}>{shortAddress(o.payer)}</td>
              <td className={td}>
                <Badge
                  tone={
                    o.status === "refunded"
                      ? "ink"
                      : o.fulfillment_state === "verified"
                        ? "done"
                        : "warn"
                  }
                >
                  {o.status === "refunded"
                    ? "Refunded"
                    : (FULFILLMENT[o.fulfillment_state] ?? o.fulfillment_state)}
                </Badge>
              </td>
              <td className={td}>
                {canRefund && o.status !== "refunded" && (
                  <Button variant="ghost" onClick={() => setRefunding(o.order_ref)}>
                    Refund
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {orders.data && orders.data.data.length === 0 && (
            <tr className={tr}>
              <td className={td} colSpan={7}>
                No orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {refunding && canRefund && (
        <Panel title={`Refund order ${refunding.slice(0, 8)}`}>
          <p className="text-prism-meta text-prism-ink-2">
            The buyer gets back exactly what they paid. Your share comes from the payout wallet that
            took the sale; Amped.Bio returns its fee. Refunds follow your published refund policy.
          </p>
          <CodeField value={code} onChange={setCode} />
          <Button
            variant="secondary"
            disabled={code.length !== 6 || prepare.isPending}
            onClick={() => prepare.mutate({ merchantId: merchant.id, orderRef: refunding, code })}
          >
            Get the data to sign
          </Button>
          {typed && (
            <>
              <pre className="max-h-[320px] overflow-auto rounded-prism-13 bg-white/80 p-[13px] text-prism-meta">
                {typed}
              </pre>
              <p className="text-prism-meta text-prism-ink-2">
                Sign the refund and the permit as typed data (EIP-712) with the payout wallet or
                your Safe. Each signature is valid for 24 hours.
              </p>
              <Field
                label="Refund signature"
                value={sigs.refund}
                onChange={refund => setSigs({ ...sigs, refund })}
              />
              <Field
                label="Permit signature"
                value={sigs.permit}
                onChange={permit => setSigs({ ...sigs, permit })}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="commit"
                  disabled={!parsed || !sigs.refund || !sigs.permit || submit.isPending}
                  onClick={() =>
                    parsed &&
                    submit.mutate({
                      merchantId: merchant.id,
                      orderRef: refunding,
                      deadline: parsed.refund.message.deadline,
                      refundSignature: sigs.refund,
                      permitDeadline: parsed.permit.message.deadline,
                      permitSignature: sigs.permit,
                    })
                  }
                >
                  Send refund
                </Button>
                <Button variant="ghost" onClick={() => setRefunding(null)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  );
}

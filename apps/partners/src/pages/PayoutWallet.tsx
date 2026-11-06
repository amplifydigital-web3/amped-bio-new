import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, ErrorCard, trpc, useAuth } from "@repo/ui";
import { day, useMerchant } from "../merchant";
import { Badge, CodeField, Field, PageTitle, Panel, Table, td, th, tr } from "../parts";

// Boards p3 and p7: the payout wallet. An Owner proposes a wallet with a signature from that
// wallet over the proof message (sign it in the wallet or the Safe, then paste it). A different
// Owner approves. It takes effect 24 hours later. Every Owner gets an email at each step (M2).
const STATUS: Record<string, "done" | "warn" | "danger" | "ink"> = {
  effective: "done",
  proposed: "warn",
  approved: "warn",
  rejected: "danger",
  cancelled: "ink",
  replaced: "ink",
};

export function PayoutWallet() {
  const merchant = useMerchant();
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const rows = useQuery(
    trpc.merchant.console.payoutWallets.queryOptions({ merchantId: merchant.id })
  );
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [code, setCode] = useState("");
  const owner = merchant.role === "owner";
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.merchant.console.payoutWallets.queryKey({ merchantId: merchant.id }),
    });
  const failed = (error: { message: string }) => toast.error(error.message);

  const challenge = useMutation({
    ...trpc.merchant.payoutWallet.challenge.mutationOptions(),
    onSuccess: data => setMessage(data?.message ?? ""),
    onError: failed,
  });
  const propose = useMutation({
    ...trpc.merchant.payoutWallet.propose.mutationOptions(),
    onSuccess: () => {
      toast.success(
        "Proposed. A different Owner approves it, then it takes effect 24 hours later."
      );
      setAddress("");
      setMessage("");
      setSignature("");
      setCode("");
      void refresh();
    },
    onError: failed,
  });
  const approve = useMutation({
    ...trpc.merchant.payoutWallet.approve.mutationOptions(),
    onSuccess: data => {
      toast.success(`Approved. It takes effect ${day(data?.effectiveAt)}.`);
      setCode("");
      void refresh();
    },
    onError: failed,
  });
  const reject = useMutation({
    ...trpc.merchant.payoutWallet.reject.mutationOptions(),
    onSuccess: () => {
      toast.success("Change stopped. The current wallet stays.");
      setCode("");
      void refresh();
    },
    onError: failed,
  });

  if (rows.isError)
    return <ErrorCard title="Payout wallets did not load" onRetry={() => void rows.refetch()} />;
  const list = rows.data ?? [];
  const current = list.find(w => w.status === "effective");

  return (
    <>
      <PageTitle>Payout wallet</PageTitle>
      <Panel title="Sales pay">
        <p className="break-all font-mono">{current?.address ?? "No payout wallet yet"}</p>
        <p className="text-prism-meta text-prism-ink-2">
          Each sale pays this wallet its share in the same transaction the buyer signs. Quotes
          signed before a change keep the wallet they were signed with.
        </p>
      </Panel>
      {owner && <CodeField value={code} onChange={setCode} />}
      <Table label="Payout wallet changes">
        <thead>
          <tr>
            <th className={th}>Wallet</th>
            <th className={th}>Status</th>
            <th className={th}>Takes effect</th>
            <th className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map(w => (
            <tr key={w.id} className={tr}>
              <td className={`${td} break-all font-mono text-prism-label`}>{w.address}</td>
              <td className={td}>
                <Badge tone={STATUS[w.status] ?? "ink"}>{w.status}</Badge>
              </td>
              <td className={td}>{day(w.effectiveAt)}</td>
              <td className={`${td} space-x-2 whitespace-nowrap`}>
                {owner && w.status === "proposed" && w.proposedById !== authUser?.id && (
                  <Button
                    disabled={code.length !== 6 || approve.isPending}
                    onClick={() =>
                      approve.mutate({ merchantId: merchant.id, walletId: w.id, code })
                    }
                  >
                    Approve change
                  </Button>
                )}
                {owner && (w.status === "proposed" || w.status === "approved") && (
                  <Button
                    variant="ghost"
                    disabled={code.length !== 6 || reject.isPending}
                    onClick={() => reject.mutate({ merchantId: merchant.id, walletId: w.id, code })}
                  >
                    {w.status === "approved" ? "Cancel change" : "Reject"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {owner && (
        <Panel title="Propose a new payout wallet">
          <Field
            label="Wallet address on Base"
            value={address}
            onChange={setAddress}
            hint="A Safe is supported."
          />
          <Button
            variant="secondary"
            disabled={!address || challenge.isPending}
            onClick={() => challenge.mutate({ merchantId: merchant.id, address })}
          >
            Get the message to sign
          </Button>
          {message && (
            <>
              <pre className="whitespace-pre-wrap rounded-prism-13 bg-white/80 p-[13px] text-prism-meta">
                {message}
              </pre>
              <p className="text-prism-meta text-prism-ink-2">
                Sign this exact message with the new wallet (personal sign, or in your Safe), then
                paste the signature.
              </p>
              <Field label="Signature" value={signature} onChange={setSignature} />
              <Button
                disabled={!signature || code.length !== 6 || propose.isPending}
                onClick={() =>
                  propose.mutate({ merchantId: merchant.id, address, message, signature, code })
                }
              >
                Propose wallet
              </Button>
            </>
          )}
        </Panel>
      )}
    </>
  );
}

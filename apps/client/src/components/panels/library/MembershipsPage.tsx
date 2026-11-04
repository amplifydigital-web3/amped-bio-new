/**
 * Library, Memberships (Build Board #26 and #25, FL-7, MB-3; row 125, boards r1, mb-q1,
 * mb-q1d, mb-q2-d2; decision 2: the only management screen). One card per membership,
 * most urgent first, one filled button on the screen: the most urgent card's. Add $N USDC
 * opens the Wallet Buy USDC panel prefilled with the shortfall and comes back here; the
 * list refetches on return. Manage opens a sheet with the next charge, coverage, the
 * renewals the approval still covers, receipts, the store policy at join and Cancel.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { format } from "date-fns";
import { Crown, ExternalLink } from "lucide-react";
import { MEMBERSHIP_CANCEL_TYPES } from "@repo/web3";
import { usdcDollarsLabel, type LibraryMembershipCard, type LibraryReceipt } from "@repo/constants";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  EmptyState,
  ErrorCard,
  Notice,
  Skeleton,
  queryClient,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { paymentChain } from "@/utils/paymentChain";
import { classifyTxError } from "../explore/pool-panel/format";
import { usePaymentChainSigner } from "../wallet/send/useUsdcSigner";
import { LIBRARY_MONEY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { CreatorAvatar, ownerName } from "./parts";

const M = LIBRARY_MONEY_COPY;

export const day = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy") : null);

export function txUrl(hash: string) {
  const base = paymentChain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

/** Wallet, Buy USDC, prefilled with the shortfall, back to Memberships (Rob 29 Oct rule). */
export function addUsdcHref(need: string) {
  return `/wallet?fund=usdc&need=${need}&returnTo=${encodeURIComponent(LIBRARY_PATHS.memberships)}`;
}

export function joinHref(handle: string) {
  return `/join/@${handle}`;
}

/** The card's one line of state. */
export function stateLine(card: LibraryMembershipCard): string {
  switch (card.state) {
    case "past_due":
      return M.states.past_due(card.graceDay);
    case "not_covered":
      return card.allowanceShort && !card.need
        ? M.states.allowanceShort
        : M.states.not_covered(day(card.nextChargeAt));
    case "covered":
      return M.states.covered(day(card.coveredThrough) ?? "");
    case "active":
      return M.states.active(day(card.nextChargeAt));
    case "renewal_paused":
      return M.states.renewal_paused;
    case "ends":
      return M.states.ends(day(card.accessUntil) ?? "");
    case "ended":
      return M.states.ended;
  }
}

/** The card's action, if any: Add USDC when the wallet is short, or Rejoin once it ended. */
export function cardAction(card: LibraryMembershipCard): { label: string; href: string } | null {
  if ((card.state === "past_due" || card.state === "not_covered") && card.need) {
    return { label: M.addUsdc(usdcDollarsLabel(card.need)), href: addUsdcHref(card.need) };
  }
  // Rejoin only after the membership ended: Join is refused while one is in force (even
  // canceled to its period end, or with a spent approval), so the card never offers it
  if (card.state === "ended") {
    return { label: M.rejoin, href: joinHref(card.owner.handle) };
  }
  return null;
}

export function MembershipsPage() {
  const [params, setParams] = useSearchParams();
  const list = useQuery({
    ...trpc.library.memberships.queryOptions(),
    refetchOnWindowFocus: true,
  });
  const openId = params.get("m");
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("m", id);
    else next.delete("m");
    setParams(next, { replace: true });
  };

  if (list.isLoading) {
    return (
      <div aria-busy aria-label="Loading" className="space-y-3">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-[120px] w-full rounded-prism-21" />
        <Skeleton className="h-[120px] w-full rounded-prism-21" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <ErrorCard
        title="Memberships did not load"
        cause="Check your connection, then try again."
        onRetry={() => void list.refetch()}
      />
    );
  }
  const cards = list.data?.items ?? [];
  // One filled button per screen: the first card that has an action (cards come most urgent first)
  const primaryId = cards.find(card => cardAction(card))?.id ?? null;

  return (
    <section aria-labelledby="memberships-title" className="space-y-[21px]">
      <div className="space-y-1">
        <h1 id="memberships-title" className="text-prism-h2 font-bold text-prism-ink">
          {M.title}
        </h1>
        <p className="text-prism-body text-prism-ink-2">{M.summary}</p>
      </div>
      {cards.length === 0 ? (
        <EmptyState icon={Crown} title={M.empty} description={M.emptyBody} />
      ) : (
        <ul className="grid gap-[13px] md:grid-cols-2">
          {cards.map(card => (
            <li key={card.id}>
              <MembershipCard
                card={card}
                primary={card.id === primaryId}
                onManage={() => setOpen(card.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <ManageSheet id={openId} onClose={() => setOpen(null)} />
    </section>
  );
}

function MembershipCard({
  card,
  primary,
  onManage,
}: {
  card: LibraryMembershipCard;
  primary: boolean;
  onManage: () => void;
}) {
  const navigate = useNavigate();
  const action = cardAction(card);
  const urgent = card.state === "past_due";
  return (
    <article
      aria-label={`${ownerName(card.owner)}, ${card.planName}`}
      className="prism-glass-clear flex h-full flex-col gap-[13px] !rounded-prism-21 p-[21px]"
      style={card.owner.accent ? { borderLeft: `4px solid ${card.owner.accent}` } : undefined}
    >
      <div className="flex items-center gap-3">
        <CreatorAvatar owner={card.owner} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-prism-ink">
            {ownerName(card.owner)}
          </p>
          <p className="flex items-center gap-1 truncate text-[14px] text-prism-ink-2">
            <Crown aria-hidden className="h-4 w-4 shrink-0" />
            {card.planName},{" "}
            {M.amountLine(usdcDollarsLabel(card.amount), M.interval[card.interval])}
          </p>
        </div>
      </div>
      <p
        className={
          urgent
            ? "text-prism-label font-semibold text-prism-warning-ink"
            : "text-prism-label text-prism-ink"
        }
      >
        {stateLine(card)}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        {action && (
          <Button variant={primary ? "default" : "secondary"} onClick={() => navigate(action.href)}>
            {action.label}
          </Button>
        )}
        {card.state !== "ended" && (
          <Button variant="ghost" onClick={onManage}>
            {M.manage}
          </Button>
        )}
      </div>
    </article>
  );
}

function Receipts({ receipts }: { receipts: LibraryReceipt[] }) {
  if (!receipts.length) return <p className="text-prism-meta text-prism-ink-2">{M.noReceipts}</p>;
  return (
    <ul className="prism-slab divide-y divide-prism-line rounded-prism-13 px-[13px]">
      {receipts.map(receipt => {
        const url = txUrl(receipt.txHash);
        return (
          <li key={receipt.txHash} className="flex min-h-touch items-center justify-between gap-3">
            <span className="text-prism-label text-prism-ink">
              {day(receipt.at)}, {usdcDollarsLabel(receipt.amount)}
            </span>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="prism-focus inline-flex min-h-touch items-center gap-1 text-prism-meta font-semibold text-prism-nav underline"
              >
                {M.viewTx}
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ManageSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const sign = usePaymentChainSigner();
  const detail = useQuery({
    ...trpc.library.membership.queryOptions({ id: id ?? "0".repeat(32) }),
    enabled: !!id,
    retry: false,
  });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: async (membershipId: string) => {
      const prepared = await trpcClient.memberships.cancel.prepare.mutate({ membershipId });
      if (prepared.refused) throw new Error(M.cancelFailed);
      const signature = await sign({
        account: prepared.signer,
        domain: prepared.typed.domain,
        types: MEMBERSHIP_CANCEL_TYPES,
        primaryType: "Cancel",
        message: {
          subscriptionRef: prepared.typed.message.subscriptionRef,
          deadline: BigInt(prepared.typed.message.deadline),
        },
      });
      const sent = await trpcClient.memberships.cancel.submit.mutate({
        membershipId,
        deadline: prepared.typed.message.deadline,
        signature,
      });
      if (sent.refused) throw new Error(M.cancelFailed);
    },
    onSuccess: () => {
      toast.add({ type: "success", title: M.canceled });
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: trpc.library.pathKey() });
      onClose();
    },
    onError: err => {
      setError(classifyTxError(err) === "rejected" ? M.rejected : M.cancelFailed);
    },
  });

  const close = () => {
    setConfirming(false);
    setError(null);
    onClose();
  };
  const card = detail.data?.card;
  const canCancel = card && card.state !== "ends" && card.state !== "ended";

  return (
    <BottomSheet open={!!id} onOpenChange={open => !open && close()}>
      <BottomSheetContent title={card ? M.manageTitle(card.planName) : M.manage}>
        <div className="space-y-[21px] px-[21px] pb-[21px]">
          {detail.isLoading ? (
            <Skeleton className="h-[160px] w-full rounded-prism-21" />
          ) : !card ? (
            <Notice variant="warning">This membership is not available.</Notice>
          ) : (
            <>
              <p className="text-prism-body text-prism-ink">
                {ownerName(card.owner)},{" "}
                {M.amountLine(usdcDollarsLabel(card.amount), M.interval[card.interval])}
              </p>
              <dl className="prism-slab divide-y divide-prism-line rounded-prism-13 px-[13px]">
                {(
                  [
                    [M.nextCharge, day(card.nextChargeAt)],
                    [M.coverage, stateLine(card)],
                    [M.chargesLeft, card.chargesLeft === null ? null : String(card.chargesLeft)],
                  ] as const
                )
                  .filter(([, value]) => value !== null)
                  .map(([label, value]) => (
                    <div
                      key={label}
                      className="flex min-h-touch items-center justify-between gap-3"
                    >
                      <dt className="text-prism-meta text-prism-ink-2">{label}</dt>
                      <dd className="text-right text-prism-label font-semibold text-prism-ink">
                        {value}
                      </dd>
                    </div>
                  ))}
              </dl>
              <section aria-labelledby="manage-receipts" className="space-y-2">
                <h3 id="manage-receipts" className="text-prism-eyebrow uppercase text-prism-ink-3">
                  {M.receipts}
                </h3>
                <Receipts receipts={detail.data?.receipts ?? []} />
              </section>
              {card.storePolicyVersion !== null && (
                <a
                  href={`${import.meta.env.VITE_LANDINGPAGE_URL}/${card.owner.handle}/store/policy?v=${card.storePolicyVersion}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="prism-focus inline-flex min-h-touch items-center gap-1 text-prism-label font-semibold text-prism-nav underline"
                >
                  {M.storePolicy(card.storePolicyVersion)}
                  <ExternalLink aria-hidden className="h-4 w-4" />
                </a>
              )}
              {error && <Notice variant="warning">{error}</Notice>}
              {canCancel &&
                (confirming ? (
                  <div className="space-y-2">
                    <p className="text-prism-body text-prism-ink">
                      {M.cancelConfirm(day(card.accessUntil))}
                    </p>
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={cancel.isPending}
                      aria-busy={cancel.isPending || undefined}
                      onClick={() => {
                        setError(null);
                        cancel.mutate(card.id);
                      }}
                    >
                      {M.cancel}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setConfirming(false)}>
                      {M.keep}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setConfirming(true)}
                  >
                    {M.cancel}
                  </Button>
                ))}
            </>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

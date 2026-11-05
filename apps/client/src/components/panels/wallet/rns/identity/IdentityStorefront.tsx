import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { AlertCircle, Check, Clock, ShieldCheck } from "lucide-react";
import {
  IDENTITY_STOREFRONT_COPY,
  formatBps,
  usdcDollars,
  type IdentityTier,
  type StorefrontOffer,
} from "@repo/constants";
import { Button, TESTNET_NOTICE, cn, trpc, trpcClient } from "@repo/ui";
import { isFeatureOn } from "@/config/featureFlags";
import { IdEyebrow } from "./parts";
import { authbaseVerifyUrl } from "./catalog";

/**
 * Authbase storefront on the Identity tab (Build Board #66, AB-2; boards s1 to s4; spec 3.4).
 * Authbase's checks as cards with a price in USDC and Buy now, which opens the Amped.Bio pay
 * sheet. Standard is the highlighted card (AB-D1). Buy now is disabled at or below the tier the
 * owner already holds. While a paid order is open the status line shows instead (board s3).
 * Renders nothing while the authbaseStorefront flag is off, so the tab keeps its old link.
 */

export const STOREFRONT_ON = isFeatureOn("authbaseStorefront");

const TIER_RANK: Record<string, number> = { STANDARD: 1, ENHANCED: 2 };

function OfferCard({
  offer,
  highlighted,
  heldTier,
  disabled,
  busy,
  onBuy,
}: {
  offer: StorefrontOffer;
  highlighted: boolean;
  heldTier: IdentityTier | null;
  disabled: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const held =
    heldTier !== null && (TIER_RANK[heldTier] ?? 0) >= (TIER_RANK[offer.code ?? ""] ?? 99);
  return (
    <li
      className={cn(
        "flex flex-col p-[21px]",
        highlighted ? "prism-lens rounded-prism-21" : "prism-glass-clear"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[20px] font-bold leading-[23px] text-prism-ink">{offer.title}</h4>
        {held ? (
          <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold text-prism-success">
            {IDENTITY_STOREFRONT_COPY.yourCheck}
          </span>
        ) : (
          offer.tag && (
            <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]">
              {offer.tag}
            </span>
          )
        )}
      </div>
      {offer.description && (
        <p className="mt-1 text-prism-label text-prism-ink-2">{offer.description}</p>
      )}
      <ul className="mt-3 flex-1 space-y-1">
        {offer.features.map(item => (
          <li key={item} className="flex items-start gap-2 text-prism-body text-prism-ink">
            <Check aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-success" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-[21px] space-y-3 border-t border-prism-line pt-3">
        <p className="text-prism-ink">
          <span className="text-[34px] font-bold leading-[34px] tabular-nums">
            ${usdcDollars(offer.amountUnits)}
          </span>{" "}
          <span className="font-bold text-prism-ink-2">USDC</span>
        </p>
        <Button
          className="w-full"
          variant={highlighted ? "default" : "secondary"}
          disabled={disabled || held || busy}
          aria-busy={busy || undefined}
          onClick={onBuy}
        >
          {IDENTITY_STOREFRONT_COPY.buyNow}
        </Button>
      </div>
    </li>
  );
}

/** The order status line (board s3): what happens next with a paid order. */
function OrderStatus({
  merchant,
  order,
}: {
  merchant: string;
  order: { purchaseId: string; status: string; fulfillmentState: string | null };
}) {
  const verifyHref = authbaseVerifyUrl(order.purchaseId);
  const inFlight = order.status === "submitting" || order.status === "submitted";
  const state = inFlight ? "checking" : (order.fulfillmentState ?? "paid");
  const line =
    state === "checking"
      ? IDENTITY_STOREFRONT_COPY.status.checking
      : state === "in_review"
        ? IDENTITY_STOREFRONT_COPY.status.inReview(merchant)
        : state === "verified"
          ? IDENTITY_STOREFRONT_COPY.status.creating(merchant)
          : state === "not_passed"
            ? IDENTITY_STOREFRONT_COPY.status.notPassed(merchant)
            : IDENTITY_STOREFRONT_COPY.status.paid(merchant);
  const Icon = state === "not_passed" ? AlertCircle : state === "paid" ? Check : Clock;
  return (
    <section
      className="prism-glass-clear space-y-2 p-[21px]"
      aria-labelledby="rns-order-status"
      aria-live="polite"
    >
      <p id="rns-order-status" className="flex items-center gap-2 font-bold text-prism-ink">
        <Icon
          aria-hidden
          className={cn(
            "h-[18px] w-[18px] shrink-0",
            state === "not_passed" ? "text-prism-danger" : "text-prism-success"
          )}
        />
        {line}
      </p>
      {state === "paid" && (
        <p className="text-prism-meta text-prism-ink-2">
          {IDENTITY_STOREFRONT_COPY.status.paidSub}
        </p>
      )}
      {/* AB-3: same tab, through Authbase's Amped.Bio sign in, with the order */}
      {(state === "paid" || state === "started" || state === "not_passed") && verifyHref && (
        <Button asChild size="lg" className="w-full">
          <a href={verifyHref}>
            {state === "not_passed"
              ? IDENTITY_STOREFRONT_COPY.startAgain
              : IDENTITY_STOREFRONT_COPY.continueTo(merchant)}
          </a>
        </Button>
      )}
    </section>
  );
}

export function IdentityStorefront({
  rnsName,
  heldTier = null,
}: {
  /** The full RNS name the check is for */
  rnsName: string;
  /** The tier the owner holds now; Buy now is disabled at or below it */
  heldTier?: IdentityTier | null;
}) {
  const navigate = useNavigate();
  const front = useQuery({
    ...trpc.merchant.storefront.queryOptions({ placement: "rns_identity" }),
    enabled: STOREFRONT_ON,
  });
  const buy = useMutation({
    mutationFn: (offerId: string) =>
      trpcClient.checkout.start.mutate({
        kind: "purchase",
        target: { type: "offer", id: offerId },
        source: "other",
        rnsName,
      }),
    onSuccess: ({ payPath }) => navigate(payPath),
  });

  if (!STOREFRONT_ON) return null;
  if (front.isPending) {
    return (
      <section aria-busy="true" className="prism-glass-clear space-y-3 p-[21px]">
        <span className="sr-only">{IDENTITY_STOREFRONT_COPY.loading}</span>
        <div className="h-[22px] w-1/2 rounded-prism-8 bg-prism-line" />
        <div className="h-4 w-4/5 rounded-prism-8 bg-prism-line" />
        <div className="h-touch w-full rounded-prism-13 bg-prism-line" />
      </section>
    );
  }
  if (front.isError) {
    return (
      <section className="prism-glass-clear space-y-2 p-[21px]" role="alert">
        <p className="flex items-center gap-2 font-bold text-prism-danger">
          <AlertCircle aria-hidden className="h-[18px] w-[18px]" />
          {IDENTITY_STOREFRONT_COPY.loadFailed}
        </p>
        <p className="text-prism-meta text-prism-ink-2">{IDENTITY_STOREFRONT_COPY.loadFailedSub}</p>
        <Button variant="secondary" onClick={() => void front.refetch()}>
          Try again
        </Button>
      </section>
    );
  }
  const data = front.data;
  if (!data || data.offers.length === 0) return null;

  const order = data.latestOrder;
  const highlightedCode = "STANDARD";

  return (
    <section aria-labelledby="rns-choose-check" className="space-y-[13px]">
      <div id="rns-choose-check">
        <IdEyebrow as="h3">{IDENTITY_STOREFRONT_COPY.choose}</IdEyebrow>
      </div>
      {order && <OrderStatus merchant={data.merchant.name} order={order} />}
      {!data.merchant.takingPayments && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-prism-13 bg-prism-warning-bg p-[13px] text-prism-warning-ink"
        >
          <AlertCircle aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          <div>
            <p className="font-semibold">
              {IDENTITY_STOREFRONT_COPY.notTaking(data.merchant.name)}
            </p>
            <p className="text-prism-meta">{IDENTITY_STOREFRONT_COPY.notTakingSub}</p>
          </div>
        </div>
      )}
      <ul className="grid gap-[13px] md:grid-cols-2">
        {data.offers.map(offer => (
          <OfferCard
            key={offer.id}
            offer={offer}
            highlighted={offer.code === highlightedCode}
            heldTier={heldTier}
            disabled={!data.merchant.takingPayments || Boolean(order)}
            busy={buy.isPending && buy.variables === offer.id}
            onBuy={() => buy.mutate(offer.id)}
          />
        ))}
      </ul>
      {buy.isError && (
        <p role="alert" className="text-prism-meta text-prism-danger">
          {IDENTITY_STOREFRONT_COPY.buyFailed}
        </p>
      )}
      <p className="flex items-start gap-2 text-prism-meta text-prism-ink-2">
        <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {IDENTITY_STOREFRONT_COPY.footer(data.merchant.name, formatBps(data.feeBps))}{" "}
          <span className="font-semibold text-prism-ink">{TESTNET_NOTICE}</span>
        </span>
      </p>
    </section>
  );
}

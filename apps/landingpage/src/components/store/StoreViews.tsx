"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  MEMBERSHIP_COPY,
  STORE_COPY,
  type MembershipPlanPublic,
  usdcDollarsLabel,
  type StorePolicyPublic,
  type StoreProductCard,
  type StoreProductPublic,
  type StorePublic,
} from "@repo/constants";
import { cn } from "@repo/ui";
import { trpcClient } from "@/lib/trpc";
import { startProductCheckout } from "@/lib/checkout";
import { CREATOR_FOCUS_RING } from "../content/theme";
import { ReportStoreButton } from "./ReportStore";

/**
 * Store surfaces on the creator's page (C9; content spec 3.8, store-catalog.md 6, store policy
 * 3.2 and 3.4; boards s2, s3, st7, sp4, sp5). In the creator's theme through ContentShell.
 * Amounts read "$18 USDC". Every store names the seller and links the store policy.
 */

const LINK_ROW = "inline-flex min-h-[44px] items-center underline-offset-2 hover:underline";

const storePath = (handle: string) => `/${handle}/store`;
const productPath = (handle: string, slug: string) => `/${handle}/store/${slug}`;
const policyPath = (handle: string, v?: number) => `/${handle}/store/policy${v ? `?v=${v}` : ""}`;

/** Join opens the app's join sheet (MB-2): the fan signs in and signs there. */
const joinUrl = (handle: string) =>
  `${process.env.NEXT_PUBLIC_PANEL_URL || "https://app.amped.bio"}/join/@${handle}`;

/** Storefront membership card (MB-2, board st4): the plan, its amounts and Join. */
export function MembershipCard({
  plan,
  preview = false,
}: {
  plan: MembershipPlanPublic;
  preview?: boolean;
}) {
  const C = MEMBERSHIP_COPY.card;
  return (
    <section
      aria-label={C.heading}
      className="flex flex-col gap-[13px] rounded-[13px] border border-current/20 p-[16px]"
    >
      <div>
        <p className="text-[14px] opacity-75">{C.heading}</p>
        <h2 className="text-[20px] font-bold leading-[26px]">{plan.name}</h2>
        {plan.description ? (
          <p className="mt-[6px] whitespace-pre-line text-[15px] leading-[22px]">
            {plan.description}
          </p>
        ) : null}
      </div>
      {plan.benefits.length ? (
        <ul className="list-disc pl-[21px] text-[15px] leading-[22px]">
          {plan.benefits.map(benefit => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
      ) : null}
      <div>
        <p className="text-[17px] font-bold">
          {C.amount(usdcDollarsLabel(plan.amountEvery30Days))}
        </p>
        {plan.amountYearly ? (
          <p className="text-[14px] opacity-80">
            {C.yearly(usdcDollarsLabel(plan.amountYearly), plan.yearlySavingPercent)}
          </p>
        ) : null}
        {plan.memberCount ? (
          <p className="text-[14px] opacity-80">{C.members(plan.memberCount)}</p>
        ) : null}
      </div>
      {preview ? (
        <span
          aria-disabled
          className="inline-flex min-h-[55px] items-center justify-center rounded-[13px] px-[21px] text-[17px] font-bold opacity-60"
          style={{ backgroundColor: "var(--amped-btn)", color: "var(--amped-font)" }}
        >
          {C.join}
        </span>
      ) : (
        <a
          href={joinUrl(plan.handle)}
          className={cn(
            "inline-flex min-h-[55px] items-center justify-center rounded-[13px] px-[21px] text-[17px] font-bold",
            CREATOR_FOCUS_RING
          )}
          style={{ backgroundColor: "var(--amped-btn)", color: "var(--amped-font)" }}
        >
          {C.join}
        </a>
      )}
    </section>
  );
}

function kindLabel(card: StoreProductCard): string {
  if (card.kind === "bundle") return `Bundle, ${card.itemCount} items`;
  const kind = card.itemKinds[0] ?? "file";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function PreviewBanner() {
  return (
    <p
      role="status"
      className="mb-[21px] rounded-[13px] border-[1.5px] border-current px-[13px] py-[10px] text-[15px]"
    >
      {STORE_COPY.previewOnly}
    </p>
  );
}

/** The fixed legal band above every store policy (store policy 3.2). Never restyled by the theme. */
export function StorePolicyNotice({ notice }: { notice: string }) {
  return (
    <div
      className="rounded-[13px] border-[1.5px] px-[16px] py-[13px] text-[14px] leading-[21px] sm:text-[16px] sm:leading-[24px]"
      style={{ background: "#FBF1DC", borderColor: "#16152B", color: "#16152B" }}
    >
      {notice}
    </div>
  );
}

function StoreFooter({
  handle,
  policyVersion,
  reportStore = false,
}: {
  handle: string;
  policyVersion: number;
  /** Storefront and policy page: Report store (store policy 3.4, SP-Q22, C10) */
  reportStore?: boolean;
}) {
  return (
    <footer className="mt-[34px] flex flex-wrap gap-x-[21px] text-[14px]">
      <Link
        href={policyPath(handle, policyVersion || undefined)}
        className={cn(LINK_ROW, CREATOR_FOCUS_RING)}
      >
        {STORE_COPY.storePolicy}
      </Link>
      {reportStore ? <ReportStoreButton handle={handle} /> : null}
    </footer>
  );
}

function ProductCard({
  handle,
  card,
  large = false,
}: {
  handle: string;
  card: StoreProductCard;
  large?: boolean;
}) {
  return (
    <Link
      href={productPath(handle, card.slug)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[13px] border border-current/15",
        CREATOR_FOCUS_RING
      )}
    >
      <div className={cn("relative w-full bg-black/10", large ? "aspect-[16/9]" : "aspect-square")}>
        {card.cover ? (
          <img
            src={card.cover.src}
            srcSet={card.cover.srcSet || undefined}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-[3px] p-[13px]">
        <span className="text-[13px] opacity-75">{kindLabel(card)}</span>
        <span className="line-clamp-2 text-[16px] font-bold leading-[21px]">{card.title}</span>
        <span className="text-[15px] font-bold">{usdcDollarsLabel(card.amountUnits)}</span>
        <span className="text-[13px] opacity-75">
          {STORE_COPY.accessLine(card.accessPeriodDays)}
        </span>
      </div>
    </Link>
  );
}

export function StorefrontView({ store }: { store: StorePublic }) {
  const [kind, setKind] = useState<"all" | "bundle" | string>("all");
  const kinds = [
    ...new Set(store.products.flatMap(p => (p.kind === "bundle" ? ["bundle"] : p.itemKinds))),
  ];
  const shown =
    kind === "all"
      ? store.products
      : store.products.filter(p =>
          kind === "bundle" ? p.kind === "bundle" : p.itemKinds.includes(kind)
        );
  const grid =
    store.layout === "list"
      ? "grid grid-cols-1 gap-[13px]"
      : "grid grid-cols-2 gap-[13px] sm:grid-cols-3";

  // The membership card sits where the creator placed it; an older order without it puts it first
  const order = store.sectionOrder.includes("membership")
    ? store.sectionOrder
    : ["membership", ...store.sectionOrder];
  const sections: Record<string, ReactNode> = {
    membership: store.membership ? (
      <MembershipCard key="membership" plan={store.membership} preview={store.preview} />
    ) : null,
    featured: store.featured.length ? (
      <section key="featured" aria-label="Featured" className="grid gap-[13px] sm:grid-cols-2">
        {store.featured.map(card => (
          <ProductCard key={card.id} handle={store.handle} card={card} large />
        ))}
      </section>
    ) : null,
    products: store.products.length ? (
      <section key="products" aria-label="Products" className="flex flex-col gap-[13px]">
        {kinds.length > 1 ? (
          <div className="flex flex-wrap gap-[8px]" role="group" aria-label="Filter products">
            {["all", ...kinds].map(value => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  "min-h-[44px] rounded-full border border-current px-[16px] text-[14px] capitalize",
                  kind === value && "font-bold",
                  CREATOR_FOCUS_RING
                )}
              >
                {value === "all" ? "All" : value === "bundle" ? "Bundles" : value}
              </button>
            ))}
          </div>
        ) : null}
        <div className={grid}>
          {shown.map((card, index) => (
            <ProductCard
              key={card.id}
              handle={store.handle}
              card={card}
              large={store.layout === "feature" && index === 0 && kind === "all"}
            />
          ))}
        </div>
      </section>
    ) : null,
    about: store.about ? (
      <section key="about" aria-label="About">
        <h2 className="text-[20px] font-bold">About</h2>
        <p className="mt-[8px] whitespace-pre-line text-[16px] leading-[24px]">{store.about}</p>
      </section>
    ) : null,
  };

  return (
    <div className="flex flex-col gap-[34px]">
      {store.preview ? <PreviewBanner /> : null}
      <header className="flex flex-wrap items-center gap-[13px]">
        {store.avatar ? (
          <img
            src={store.avatar}
            alt=""
            className="h-[55px] w-[55px] rounded-full object-cover sm:h-[89px] sm:w-[89px]"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-[34px] sm:text-[40px] sm:leading-[46px]">
            {store.name}
          </h1>
          {store.tagline ? (
            <p className="mt-[3px] text-[16px] opacity-80">{store.tagline}</p>
          ) : null}
        </div>
      </header>

      {order.map(section => sections[section] ?? null)}
      {!store.products.length ? <p className="text-[16px]">No products yet.</p> : null}

      <section
        aria-label={STORE_COPY.buyingHere}
        className="rounded-[13px] border border-current/20 p-[16px]"
      >
        <h2 className="text-[17px] font-bold">{STORE_COPY.buyingHere}</h2>
        <p className="mt-[8px] text-[15px] leading-[22px]">
          {STORE_COPY.soldBy(store.sellerName)} {store.buyingHere.summary}
        </p>
        <Link
          href={policyPath(store.handle, store.buyingHere.policyVersion || undefined)}
          className={cn(LINK_ROW, "font-bold", CREATOR_FOCUS_RING)}
        >
          {STORE_COPY.readPolicy}
        </Link>
      </section>

      <StoreFooter
        handle={store.handle}
        policyVersion={store.buyingHere.policyVersion}
        reportStore
      />
    </div>
  );
}

export function ProductPageView({ product }: { product: StoreProductPublic }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      await startProductCheckout({ offerId: product.id, source: "store" });
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Try again.");
      setBusy(false);
    }
  };
  const amount = usdcDollarsLabel(product.amountUnits);
  return (
    <div className="flex flex-col gap-[21px]">
      {product.preview ? <PreviewBanner /> : null}
      <Link
        href={storePath(product.handle)}
        className={cn(LINK_ROW, "gap-[6px] text-[15px]", CREATOR_FOCUS_RING)}
      >
        <ArrowLeft aria-hidden className="h-[18px] w-[18px]" /> Store
      </Link>
      {product.cover ? (
        <img
          src={product.cover.src}
          srcSet={product.cover.srcSet || undefined}
          alt=""
          className="aspect-[16/9] w-full rounded-[13px] object-cover"
        />
      ) : null}
      <div>
        <p className="text-[14px] opacity-75">{kindLabel(product)}</p>
        <h1 className="text-[28px] font-bold leading-[34px] sm:text-[34px] sm:leading-[40px]">
          {product.title}
        </h1>
        {product.description ? (
          <p className="mt-[13px] whitespace-pre-line text-[16px] leading-[24px]">
            {product.description}
          </p>
        ) : null}
      </div>

      <section aria-label="What is included" className="flex flex-col gap-[8px]">
        <h2 className="text-[17px] font-bold">What is included</h2>
        <ul className="flex flex-col divide-y divide-current/15 rounded-[13px] border border-current/15">
          {product.items.map(item => (
            <li
              key={item.publicId}
              className="flex items-center justify-between gap-[13px] px-[13px] py-[10px]"
            >
              <span className="min-w-0 truncate text-[15px]">{item.title}</span>
              <span className="shrink-0 text-[13px] capitalize opacity-75">{item.kind}</span>
            </li>
          ))}
        </ul>
      </section>

      <div
        className="sticky bottom-[calc(13px+env(safe-area-inset-bottom,0px))] flex flex-col gap-[8px] rounded-[13px] border border-current/20 p-[13px] backdrop-blur"
        style={{ backgroundColor: "var(--amped-container)" }}
      >
        <p className="text-[14px]">{STORE_COPY.accessLine(product.accessPeriodDays)}</p>
        {product.membership ? (
          <p className="text-[14px]">
            {MEMBERSHIP_COPY.card.alsoIn(product.membership.name)}{" "}
            {product.preview ? null : (
              <a
                href={joinUrl(product.handle)}
                className={cn(LINK_ROW, "font-bold", CREATOR_FOCUS_RING)}
              >
                {MEMBERSHIP_COPY.card.joinInstead}
              </a>
            )}
          </p>
        ) : null}
        <button
          type="button"
          onClick={buy}
          disabled={busy || product.preview}
          className={cn(
            "inline-flex min-h-[55px] items-center justify-center gap-[8px] rounded-[13px] px-[21px] text-[17px] font-bold disabled:opacity-60",
            CREATOR_FOCUS_RING
          )}
          style={{ backgroundColor: "var(--amped-btn)", color: "var(--amped-font)" }}
        >
          {busy ? (
            <Loader2 aria-hidden className="h-[20px] w-[20px] animate-spin" />
          ) : (
            STORE_COPY.buy(amount)
          )}
        </button>
        {error ? (
          <p role="alert" className="text-[14px]">
            {error}
          </p>
        ) : null}
        <p className="text-[14px]">
          {STORE_COPY.soldBy(product.sellerName)}{" "}
          <Link
            href={policyPath(product.handle, product.policyVersion || undefined)}
            className={cn(LINK_ROW, "font-bold", CREATOR_FOCUS_RING)}
          >
            {STORE_COPY.storePolicy}
          </Link>
        </p>
      </div>
      <StoreFooter handle={product.handle} policyVersion={product.policyVersion} />
    </div>
  );
}

export function StorePolicyView({ policy }: { policy: StorePolicyPublic }) {
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="flex flex-col gap-[21px]">
      <Link
        href={storePath(policy.handle)}
        className={cn(LINK_ROW, "gap-[6px] text-[15px]", CREATOR_FOCUS_RING)}
      >
        <ArrowLeft aria-hidden className="h-[18px] w-[18px]" /> Store
      </Link>
      {!policy.current ? (
        <p role="status" className="text-[15px]">
          {STORE_COPY.policy.pastVersion(
            policy.version,
            date(policy.publishedAt),
            policy.supersededAt ? date(policy.supersededAt) : ""
          )}{" "}
          <Link
            href={policyPath(policy.handle)}
            className={cn(LINK_ROW, "font-bold", CREATOR_FOCUS_RING)}
          >
            {STORE_COPY.policy.seeCurrent}
          </Link>
        </p>
      ) : null}
      <StorePolicyNotice notice={policy.notice} />
      <article className="whitespace-pre-line text-[16px] leading-[24px]">{policy.text}</article>
      <p className="text-[14px] opacity-75">
        {STORE_COPY.policy.published(policy.version, date(policy.publishedAt))}
      </p>
      <footer className="text-[14px]">
        <ReportStoreButton handle={policy.handle} />
      </footer>
    </div>
  );
}

/**
 * The owner's preview (C9): the server render has no viewer, so a store that is not public is
 * not found there. With ?preview=1 the page asks again from the browser, with the owner's
 * session. Anyone else sees that the store is not open.
 */
export function StoreOwnerPreview({ handle, slug }: { handle: string; slug?: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "store"; store: StorePublic }
    | { kind: "product"; product: StoreProductPublic }
    | { kind: "closed" }
  >({ kind: "loading" });
  useEffect(() => {
    let live = true;
    const load = slug
      ? trpcClient.store.product
          .query({ handle, slug })
          .then(product => ({ kind: "product" as const, product }))
      : trpcClient.store.public
          .query({ handle })
          .then(store => ({ kind: "store" as const, store }));
    load.then(next => live && setState(next)).catch(() => live && setState({ kind: "closed" }));
    return () => {
      live = false;
    };
  }, [handle, slug]);
  if (state.kind === "loading") {
    return <Loader2 aria-label="Loading" className="mx-auto h-[24px] w-[24px] animate-spin" />;
  }
  if (state.kind === "store") return <StorefrontView store={state.store} />;
  if (state.kind === "product") return <ProductPageView product={state.product} />;
  return <p className="text-center text-[16px]">This store is not open.</p>;
}

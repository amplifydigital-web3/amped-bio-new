"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Check, Coins, ExternalLink, Info, Share2 } from "lucide-react";
import Decimal from "decimal.js";
import { formatEther } from "viem";
import { getChainConfig } from "@repo/web3";
import { Button, EmptyState, Skeleton, TESTNET_NOTICE, cn } from "@repo/ui";
import { trpc, type trpcClient } from "@/lib/trpc";
import { authClient } from "@/lib/auth-client";
import { getPanelPoolUrl } from "@/lib/panel";
import { formatHandle } from "@/lib/handle";

// Screen Review 071 (D14, D20). The public pool page: the featured card with
// the pool name as the h1, the About card, and the value panel at rest with
// the pool terms, the testnet card and one Stake in this pool step. No APR or
// APY anywhere on the page (I01). The debug routes stay public and unlisted
// (071 D1, 096 D1); this page no longer links to them.

type PoolByAddress = Awaited<ReturnType<typeof trpcClient.pools.fan.getPoolByAddress.query>>;
type PoolCreator = Awaited<
  ReturnType<typeof trpcClient.pools.fan.getPoolDetailsForModal.query>
>["creator"];

export interface PoolDetailInitial {
  pool: PoolByAddress;
  creator: PoolCreator | null;
}

// Approved slab strings (071 D2 wording, shared with the editor pool panel)
const UNSTAKE_TERMS =
  "Unstake any time. Your tREVO returns to your wallet when the transaction confirms.";
const RATE_HELPER =
  "Estimated from current network stake and rewards. It changes as stake changes and is not guaranteed.";
// 071 I01: no APR or APY string anywhere on the page, links included. The only
// rate article today has "apy" in its slug, so How it is calculated renders once
// the article moves to a slug without it.
const RATE_ARTICLE: string | null = null;
// 071 D2: "How pool rewards work" ships only once counsel approves the article.
// Set the URL here when it exists; until then the link does not render.
const POOL_REWARDS_ARTICLE: string | null = null;
// creatorFee is in basis points; 10000 means the creator keeps every reward
const FULL_CREATOR_SHARE = 10000;

/** The server sends bigints as wei strings (BigInt toJSON). */
function toWei(value: unknown): bigint {
  try {
    return BigInt(value as string | bigint);
  } catch {
    return 0n;
  }
}

/** Up to 4 decimals, trailing zeros removed, rounded down, digits grouped. */
function formatAmount(wei: bigint) {
  const floored = new Decimal(formatEther(wei)).toDecimalPlaces(4, Decimal.ROUND_DOWN);
  const [whole, fraction] = floored.toFixed().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function formatRate(basisPoints: number) {
  return `${(basisPoints / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% a year (est.)`;
}

function useDelayed(active: boolean, ms: number) {
  const [shown, setShown] = useState(false);
  React.useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function Eyebrow({ children, as: Tag = "h2" }: { children: React.ReactNode; as?: "h2" | "p" }) {
  return (
    <Tag className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
      {children}
    </Tag>
  );
}

function SlabRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <dt className="text-prism-label text-prism-ink-2">{label}</dt>
        {value !== undefined && (
          <dd className="text-right text-prism-label font-semibold tabular-nums text-prism-ink">
            {value}
          </dd>
        )}
      </div>
      {children && <dd>{children}</dd>}
    </div>
  );
}

function PoolArt({ url, className }: { url?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("block overflow-hidden bg-prism-value-panel-2", className)}>
      {url && !failed ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center" aria-hidden>
          <Coins className="h-14 w-14 text-prism-value-ink" strokeWidth={1.5} />
        </span>
      )}
    </span>
  );
}

/** 071 I09: native share, else copy the link and confirm in place. */
function ShareButton({ name, url }: { name: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: name, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void share()}
        aria-label="Share pool"
        className="prism-icon-btn prism-focus relative z-10 flex h-touch w-touch shrink-0 items-center justify-center"
      >
        {copied ? (
          <Check className="h-[21px] w-[21px] text-prism-success" aria-hidden />
        ) : (
          <Share2 className="h-[21px] w-[21px] text-prism-ink-2" aria-hidden />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied
          ? "Link copied"
          : failed
            ? "The link did not copy. Copy it from the address bar."
            : ""}
      </span>
    </>
  );
}

/** 071 I10: links open in a new tab; long descriptions clamp at 8 lines. */
function Description({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node && !expanded) setOverflows(node.scrollHeight > node.clientHeight + 1);
  }, [text, expanded]);
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-line break-words text-prism-body text-prism-ink",
          !expanded && "line-clamp-[8]"
        )}
      >
        {parts.map((part, index) =>
          /^https?:\/\//.test(part) ? (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener nofollow ugc"
              className="prism-focus rounded font-semibold text-prism-nav underline underline-offset-2"
            >
              {part}
            </a>
          ) : (
            <React.Fragment key={index}>{part}</React.Fragment>
          )
        )}
      </p>
      {(overflows || expanded) && (
        <Button
          variant="ghost"
          className="-ml-3 mt-2"
          aria-expanded={expanded}
          onClick={() => setExpanded(open => !open)}
        >
          {expanded ? "Show less" : "Read more"}
        </Button>
      )}
    </>
  );
}

/** 071 I05: the solid compliance card, verbatim, right above Stake. */
function ComplianceCard() {
  const body = TESTNET_NOTICE.replace(/^Testnet only\.\s*/, "");
  return (
    <div role="note" className="prism-notice flex items-start gap-3">
      <Info className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink" aria-hidden />
      <div className="min-w-0 flex-1 text-prism-body text-prism-ink">
        <p className="font-bold text-prism-warning-ink">Testnet only.</p>
        {body}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

export function PoolNotFound() {
  return (
    <div className="prism-glass-clear mx-auto max-w-[610px] !rounded-prism-21">
      <EmptyState
        icon={Coins}
        title="Pool not found"
        description="This address has no pool on Amped.Bio."
        action={
          <Button asChild variant="secondary">
            <Link href="/i/pools">Browse pools</Link>
          </Button>
        }
      />
    </div>
  );
}

function PoolError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="prism-glass-clear flex max-w-[610px] items-start gap-3 !rounded-prism-21 p-[21px]"
    >
      <AlertCircle className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-prism-label font-bold text-prism-ink">Pool did not load</p>
        <p className="mt-1 text-prism-body text-prism-ink-2">
          The server did not answer. Check your connection and try again.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
          <Button asChild variant="ghost">
            <Link href="/i/pools">All pools</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PoolSkeleton() {
  return (
    <div aria-busy aria-label="Loading pool" className={GRID}>
      <div className="prism-glass-clear h-[419px] !rounded-prism-21 p-2 lg:col-start-1 lg:row-start-1">
        <Skeleton className="h-[202px] w-full rounded-prism-13" />
        <div className="space-y-3 px-3 pt-4">
          <Skeleton className="h-[34px] w-1/2 rounded-full" />
          <Skeleton className="h-6 w-3/4 rounded-full" />
          <Skeleton className="h-4 w-1/3 rounded-full" />
        </div>
      </div>
      <div
        className={`prism-glass-clear h-[233px] space-y-3 !rounded-prism-21 p-[21px] ${ABOUT_PLACE}`}
      >
        <Skeleton className="h-3 w-1/3 rounded-full" />
        <Skeleton className="h-4 w-full rounded-full" />
        <Skeleton className="h-4 w-5/6 rounded-full" />
        <Skeleton className="h-4 w-2/3 rounded-full" />
      </div>
      <div className="prism-glass-clear h-[521px] space-y-4 !rounded-prism-34 p-[34px] lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-3 xl:row-span-1">
        <Skeleton className="h-[55px] w-2/3 rounded-prism-13" />
        <Skeleton className="h-[233px] w-full rounded-prism-21" />
        <Skeleton className="h-[89px] w-full rounded-prism-21" />
        <Skeleton className="h-[55px] w-full rounded-prism-13" />
      </div>
    </div>
  );
}

// Desktop (xl): card 495, About on the x 550 line, value panel 508 at x 911.
// lg: card and About stack beside the panel. Below lg: one column.
const ABOUT_PLACE = "lg:col-start-1 lg:row-start-2 xl:col-start-2 xl:row-start-1";
const GRID =
  "grid grid-cols-1 items-start gap-[21px] lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_1fr] xl:grid-cols-[495px_minmax(0,1fr)_508px] xl:grid-rows-none";

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function PoolDetailContent({
  poolAddress,
  initial,
}: {
  poolAddress: string;
  initial?: PoolDetailInitial;
}) {
  const poolQuery = useQuery({
    ...trpc.pools.fan.getPoolByAddress.queryOptions({ poolAddress }),
    initialData: initial?.pool,
    staleTime: 60_000,
    retry: 1,
  });
  // The creator name and handle come from the details query
  const creatorQuery = useQuery({
    ...trpc.pools.fan.getPoolDetailsForModal.queryOptions({ poolAddress }),
    select: data => data.creator,
    enabled: !initial?.creator,
    staleTime: 60_000,
    retry: false,
  });
  const { data: session } = authClient.useSession();
  const showSkeleton = useDelayed(poolQuery.isPending, 400);

  const pool = poolQuery.data;
  const creator = initial?.creator ?? creatorQuery.data ?? null;

  if (poolQuery.isPending) return showSkeleton ? <PoolSkeleton /> : null;
  if (poolQuery.isError || !pool) {
    if (poolQuery.error?.data?.code === "NOT_FOUND") return <PoolNotFound />;
    return <PoolError onRetry={() => void poolQuery.refetch()} />;
  }

  const chain = getChainConfig(Number(pool.chainId));
  const symbol = chain?.nativeCurrency.symbol ?? "tREVO";
  const explorer = chain?.blockExplorers?.default?.url;
  const total = toWei(pool.stakedAmount);
  const share = typeof pool.creatorFee === "number" ? pool.creatorFee : null;
  const keepsAll = share !== null && share >= FULL_CREATOR_SHARE;
  const pageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/i/pools/${pool.address}`
      : `/i/pools/${pool.address}`;

  // 071 I03: signed in opens the editor pool panel; signed out signs in first
  // and returns to the same panel
  const panelUrl = getPanelPoolUrl(pool.address);
  const stakeHref = session?.user ? panelUrl : `/login?returnTo=${encodeURIComponent(panelUrl)}`;
  const stakeButton = (
    <Button asChild size="lg" className="w-full">
      <a href={stakeHref}>
        Stake in this pool
        <ArrowRight aria-hidden />
      </a>
    </Button>
  );

  const creatorHref = creator?.handle ? `/${formatHandle(creator.handle)}` : null;

  return (
    <>
      <div className={GRID}>
        {/* 071 I08: featured G3 lens card */}
        <article className="prism-lens relative flex flex-col gap-3 p-2 lg:col-start-1 lg:row-start-1 xl:min-h-[419px]">
          <span aria-hidden className="prism-halo-card" />
          <span aria-hidden className="prism-rim" />
          <PoolArt url={pool.image?.url} className="relative h-[202px] rounded-prism-13" />
          <div className="relative space-y-2 px-3 pb-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-prism-value-panel-1 text-prism-label font-bold text-prism-nav-pressed"
              >
                {(creator?.name || creator?.handle || "?").charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {creatorHref ? (
                  <Link
                    href={creatorHref}
                    className="prism-focus inline-flex min-h-touch items-center rounded text-prism-meta font-semibold text-prism-nav underline-offset-4 hover:underline"
                  >
                    @{creator?.handle}
                  </Link>
                ) : null}
              </span>
              <ShareButton name={pool.name} url={pageUrl} />
            </div>
            <h1 className="break-words text-prism-card-title text-prism-ink">{pool.name}</h1>
            {creator?.name && <p className="text-prism-body text-prism-ink-2">by {creator.name}</p>}
          </div>
        </article>

        {/* 071 I10: About card. No description, no card. */}
        {pool.description ? (
          <section
            aria-labelledby="pool-about"
            className={`prism-glass-clear space-y-3 !rounded-prism-21 p-[21px] ${ABOUT_PLACE}`}
          >
            <span id="pool-about">
              <Eyebrow>About this pool</Eyebrow>
            </span>
            <Description text={pool.description} />
          </section>
        ) : (
          <div className={`hidden xl:block ${ABOUT_PLACE}`} aria-hidden />
        )}

        {/* 071 I06, I07, I14: the value panel at rest */}
        <section
          aria-labelledby="pool-stake"
          className="prism-glass-clear space-y-[21px] !rounded-prism-21 p-[21px] lg:prism-value-panel lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:!rounded-prism-34 lg:p-[34px] xl:col-start-3 xl:row-span-1"
        >
          <div className="flex items-center gap-[13px]">
            <PoolArt
              url={pool.image?.url}
              className="h-commit w-commit shrink-0 rounded-prism-13 [&_svg]:h-[21px] [&_svg]:w-[21px]"
            />
            <div className="min-w-0">
              <Eyebrow as="p">Stake in</Eyebrow>
              <h2 id="pool-stake" className="truncate text-prism-panel-title text-prism-ink">
                {pool.name}
              </h2>
              {creator?.handle && (
                <p className="text-prism-meta text-prism-ink-2">by @{creator.handle}</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Eyebrow>About this pool</Eyebrow>
            <dl className="prism-slab divide-y divide-prism-line">
              <SlabRow label="Pool total" value={`${formatAmount(total)} ${symbol}`} />
              <SlabRow
                label="Backed by"
                value={`${pool.fans.toLocaleString("en-US")} ${pool.fans === 1 ? "fan" : "fans"}`}
              />
              <SlabRow
                label="Creator share"
                value={
                  share === null
                    ? "Not set"
                    : `${(share / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% of pool rewards`
                }
              />
              {keepsAll ? (
                <SlabRow label="Network Reward Rate">
                  <p className="mt-1 text-prism-body text-prism-ink">
                    The creator keeps 100% of pool rewards. Fans in this pool receive no rewards.
                  </p>
                </SlabRow>
              ) : (
                <SlabRow
                  label="Network Reward Rate"
                  value={typeof pool.apy === "number" ? formatRate(pool.apy) : undefined}
                >
                  {typeof pool.apy === "number" ? (
                    <>
                      <p className="mt-1 text-prism-meta text-prism-ink-2">{RATE_HELPER}</p>
                      {RATE_ARTICLE && (
                        <a
                          href={RATE_ARTICLE}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="prism-focus mt-1 inline-block rounded text-prism-meta font-semibold text-prism-nav underline underline-offset-2"
                        >
                          How it is calculated
                          <span className="sr-only">
                            {" "}
                            (Network Reward Rate, opens in a new tab)
                          </span>
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-prism-body text-prism-ink">
                      {total > 0n
                        ? "Rate unavailable right now."
                        : "No rate yet. The rate shows once fans stake in this pool."}
                    </p>
                  )}
                </SlabRow>
              )}
              <SlabRow label="Unstaking">
                <p className="mt-1 text-prism-body text-prism-ink">{UNSTAKE_TERMS}</p>
              </SlabRow>
            </dl>
            {POOL_REWARDS_ARTICLE && (
              <Button asChild variant="ghost" className="-ml-3">
                <a href={POOL_REWARDS_ARTICLE} target="_blank" rel="noopener noreferrer">
                  How pool rewards work
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
          </div>

          <ComplianceCard />
          {/* Mobile keeps Stake in the sticky bar below (I14) */}
          <div className="hidden lg:block">{stakeButton}</div>
          {explorer && (
            <div className="flex justify-center">
              <Button asChild variant="ghost">
                <a
                  href={`${explorer}/address/${pool.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View contract on explorer
                  <ExternalLink aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* 071 I14: at 390 Stake stays visible at every scroll position */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-[13px] pb-[calc(13px+env(safe-area-inset-bottom))] lg:hidden">
        <div className="prism-glass-nav rounded-prism-21 p-[13px]">{stakeButton}</div>
      </div>
    </>
  );
}

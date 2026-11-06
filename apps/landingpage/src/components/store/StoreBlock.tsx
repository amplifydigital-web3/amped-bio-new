"use client";

import { useId } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  STORE_COPY,
  usdcDollarsLabel,
  type StoreBioBlock,
  type StoreBlock as StoreBlockType,
  type ThemeConfig,
} from "@repo/constants";
import { cn } from "@repo/ui";
import { CREATOR_FOCUS_RING, creatorSurface } from "../content/theme";

const B = STORE_COPY.block;

/**
 * Store block on the creator's page (Build Board #20, store-catalog.md 6, board
 * st10). Up to 6 products in a row labelled with the product count, each card a
 * link to its product page, then Visit store. The products come from the server
 * (getHandle storeBlock), which sends null while the store is not live or has no
 * active product, so the block hides itself. 18+ products are never listed.
 * Membership plans join the row with MB-1.
 */
export function StoreBlock({
  block,
  theme,
  store,
}: {
  block: StoreBlockType;
  theme: ThemeConfig | undefined;
  store: StoreBioBlock | null;
}) {
  const headingId = useId();
  if (!store || store.products.length === 0) return null;
  const heading = block.config.label?.trim() || store.name || B.name;
  const storeHref = `/${store.handle}/store`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[21px] p-[21px]"
      style={creatorSurface(theme)}
    >
      <div className="mb-[13px] flex items-baseline justify-between gap-[13px]">
        <h2 id={headingId} className="min-w-0 truncate text-[20px] font-bold leading-[26px]">
          {heading}
        </h2>
        <span className="shrink-0 text-[14px] opacity-80">{B.count(store.productCount)}</span>
      </div>

      <ul
        aria-label={B.count(store.productCount)}
        className="-mx-[21px] flex snap-x snap-mandatory gap-[13px] overflow-x-auto px-[21px] pb-[4px]"
      >
        {store.products.map(card => (
          <li key={card.id} className="w-[144px] shrink-0 snap-start">
            <Link
              href={`/${store.handle}/store/${card.slug}`}
              className={cn(
                "flex min-h-[44px] flex-col overflow-hidden rounded-[13px] border border-current/15",
                CREATOR_FOCUS_RING
              )}
            >
              <div className="relative aspect-square w-full bg-black/10">
                {card.cover ? (
                  <img
                    src={card.cover.src}
                    srcSet={card.cover.srcSet || undefined}
                    sizes="144px"
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-[3px] p-[8px]">
                <span className="line-clamp-2 text-[15px] font-bold leading-[20px]">
                  {card.title}
                </span>
                <span className="text-[14px] font-semibold">
                  {usdcDollarsLabel(card.amountUnits)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={storeHref}
        className={cn(
          "mt-[13px] flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-current/25 px-[21px] text-[15px] font-semibold",
          CREATOR_FOCUS_RING
        )}
      >
        {B.visitStore}
        <ChevronRight aria-hidden className="h-4 w-4" />
      </Link>
    </section>
  );
}

import * as React from "react";
import { ExternalLink, Trophy } from "lucide-react";
import { cn } from "../utils";

// Prism pool cards (spec section 9). The caller passes the figures and their
// labels, so each screen uses its approved wording. Never label a rate APY or
// APR; the approved label is "Network Reward Rate".

export interface PoolStat {
  label: string;
  value: React.ReactNode;
}

export interface PoolCardData {
  name: string;
  // Creator display name and @handle
  creatorName?: string;
  creatorHandle?: string;
  creatorAvatarUrl?: string | null;
  artUrl?: string | null;
  category?: string;
  byline?: React.ReactNode;
  stats?: PoolStat[];
}

function PoolArt({
  url,
  alt,
  className,
  iconClassName,
}: {
  url?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div className={cn("overflow-hidden bg-prism-value-panel-2", className)}>
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center" aria-hidden>
          <Trophy className={cn("text-prism-value-ink", iconClassName)} strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

function CreatorRow({ pool }: { pool: PoolCardData }) {
  if (!pool.creatorName && !pool.creatorHandle) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-full bg-prism-value-panel-1">
        {pool.creatorAvatarUrl && (
          <img src={pool.creatorAvatarUrl} alt="" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 truncate text-prism-meta text-prism-ink-2">
        {pool.creatorName && (
          <span className="font-semibold text-prism-ink">{pool.creatorName}</span>
        )}
        {pool.creatorHandle && <span> {pool.creatorHandle}</span>}
      </span>
    </div>
  );
}

// Featured: the G3 lens, the one focused object of its region. Art 202 high,
// badges 26 high, title 26/33, stats footer, View page opens a new tab.
export function PoolCardFeatured({
  pool,
  selected = false,
  onSelect,
  viewPageHref,
  className,
}: {
  pool: PoolCardData;
  selected?: boolean;
  onSelect?: () => void;
  viewPageHref?: string;
  className?: string;
}) {
  return (
    <article className={cn("prism-lens flex flex-col gap-3 p-2 font-prism", className)}>
      <span aria-hidden className="prism-halo-card" />
      <span aria-hidden className="prism-rim" />
      <div className="relative">
        <PoolArt
          url={pool.artUrl}
          alt={`${pool.name} pool`}
          className="h-[202px] rounded-prism-13"
          iconClassName="h-14 w-14"
        />
        <div className="absolute left-2 top-2 flex gap-1.5">
          {selected && (
            <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-prism-nav px-2 text-prism-meta font-semibold text-white">
              Selected
            </span>
          )}
          {pool.category && (
            <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold text-prism-ink-2">
              {pool.category}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-2 px-3">
        <CreatorRow pool={pool} />
        <h3 className="text-prism-card-title text-prism-ink">
          {onSelect ? (
            <button
              type="button"
              onClick={onSelect}
              className="prism-focus rounded-prism-8 text-left after:absolute after:inset-0 after:content-['']"
            >
              {pool.name}
            </button>
          ) : (
            pool.name
          )}
        </h3>
        {pool.byline && (
          <p className="text-[16px] leading-[26px] text-prism-ink-2">{pool.byline}</p>
        )}
      </div>
      {(pool.stats?.length || viewPageHref) && (
        <footer className="mx-3 flex flex-wrap items-end justify-between gap-4 border-t border-prism-line pb-2 pt-3">
          <dl className="flex flex-wrap gap-6">
            {pool.stats?.map(stat => (
              <div key={stat.label}>
                <dt className="text-prism-meta text-prism-ink-2">{stat.label}</dt>
                <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          {viewPageHref && (
            <a
              href={viewPageHref}
              target="_blank"
              rel="noopener noreferrer"
              className="prism-btn-secondary prism-focus relative z-10 inline-flex h-touch items-center gap-2 rounded-prism-13 px-4 text-prism-label font-semibold"
            >
              View page
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </footer>
      )}
    </article>
  );
}

// Medium: G1 clear card, art 110, title 16/20, meta 13/16.
export function PoolCardMedium({
  pool,
  onSelect,
  className,
}: {
  pool: PoolCardData;
  onSelect?: () => void;
  className?: string;
}) {
  const Wrapper = onSelect ? "button" : "div";
  return (
    <Wrapper
      {...(onSelect ? { type: "button" as const, onClick: onSelect } : {})}
      className={cn(
        "prism-glass-clear prism-focus flex w-full flex-col gap-2 p-2 text-left font-prism transition-shadow duration-prism-hover ease-prism",
        onSelect && "hover:shadow-prism-e4",
        className
      )}
    >
      <PoolArt
        url={pool.artUrl}
        alt=""
        className="h-[110px] w-full rounded-prism-13"
        iconClassName="h-10 w-10"
      />
      <div className="space-y-1 px-2 pb-2">
        <p className="text-prism-label font-bold text-prism-ink">{pool.name}</p>
        {pool.creatorHandle && (
          <p className="text-prism-meta text-prism-ink-2">{pool.creatorHandle}</p>
        )}
        {pool.stats && pool.stats.length > 0 && (
          <p className="text-prism-meta tabular-nums text-prism-ink-2">
            {pool.stats.map((stat, index) => (
              <React.Fragment key={stat.label}>
                {index > 0 && <span aria-hidden> · </span>}
                <span className="sr-only">{stat.label} </span>
                {stat.value}
              </React.Fragment>
            ))}
          </p>
        )}
      </div>
    </Wrapper>
  );
}

// Row: G0 flat, 46 high (44 target plus hairline), 34 art r8, name 16/20 600,
// category 13, figures right aligned and tabular.
export function PoolRow({
  pool,
  onSelect,
  className,
}: {
  pool: PoolCardData;
  onSelect?: () => void;
  className?: string;
}) {
  const Wrapper = onSelect ? "button" : "div";
  return (
    <Wrapper
      {...(onSelect ? { type: "button" as const, onClick: onSelect } : {})}
      className={cn(
        "prism-row prism-focus flex min-h-[46px] w-full items-center gap-3 px-1 text-left font-prism",
        onSelect && "hover:bg-white/40",
        className
      )}
    >
      <PoolArt
        url={pool.artUrl}
        alt=""
        className="h-[34px] w-[34px] shrink-0 rounded-prism-8"
        iconClassName="h-4 w-4"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-prism-label font-semibold text-prism-ink">
          {pool.name}
        </span>
        {pool.category && (
          <span className="block text-prism-meta text-prism-ink-2">{pool.category}</span>
        )}
      </span>
      {pool.stats?.map(stat => (
        <span
          key={stat.label}
          className="shrink-0 text-right text-prism-meta tabular-nums text-prism-ink"
        >
          <span className="sr-only">{stat.label} </span>
          {stat.value}
        </span>
      ))}
    </Wrapper>
  );
}

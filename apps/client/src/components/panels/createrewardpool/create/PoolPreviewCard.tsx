import { ImageIcon } from "lucide-react";
import { cn } from "@repo/ui";
import { FULL_SHARE_CARD, INITIAL_STAKE } from "./copy";

export interface PreviewValues {
  name: string;
  description: string;
  share: number;
  image: string | null;
  creatorName: string;
  handle: string;
  avatar?: string | null;
  symbol: string;
}

// Placeholder art (065 I03): lavender fill with a 34 image icon
function Art({ image, className }: { image: string | null; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-prism-13 bg-[#EFE7F8]", className)}>
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon aria-hidden className="h-[34px] w-[34px] text-prism-value-ink" />
        </div>
      )}
    </div>
  );
}

function byline({ creatorName, description }: PreviewValues) {
  const first = description.trim().split("\n")[0];
  return [creatorName && `by ${creatorName}`, first].filter(Boolean).join(" · ");
}

/**
 * Screen Review 065 I03: the pool as fans will see it in Explore. Featured
 * (section 9) on desktop, Medium on mobile. Updates as the creator types.
 * In the commit state (066 I01) the card drops its rim.
 */
export function PoolPreviewCard({
  values,
  calm = false,
}: {
  values: PreviewValues;
  calm?: boolean;
}) {
  const title = values.name.trim() || "Your pool";
  return (
    <article
      aria-label={`Preview of ${title}`}
      className="prism-lens w-full max-w-[495px] p-[8px] font-prism"
    >
      {!calm && <span aria-hidden className="prism-rim" />}
      <div className="relative">
        <Art image={values.image} className="h-[202px] w-full" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="h-[34px] w-[34px] overflow-hidden rounded-full bg-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]">
            {values.avatar && (
              <img src={values.avatar} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span
            className={cn(
              "text-prism-meta font-semibold",
              values.image ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]" : "text-prism-ink"
            )}
          >
            @{values.handle}
          </span>
        </div>
      </div>
      <div className="px-[13px] pb-[13px] pt-[21px]">
        <h3 className="line-clamp-2 break-words text-prism-card-title text-prism-ink">{title}</h3>
        <p className="mt-1 line-clamp-1 text-prism-body text-prism-ink-2">{byline(values)}</p>
        <dl className="mt-3 flex gap-[34px] border-t border-prism-line pt-3">
          <div>
            <dt className="text-prism-meta text-prism-ink-2">Fans</dt>
            <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">0</dd>
          </div>
          <div>
            <dt className="text-prism-meta text-prism-ink-2">Total staked</dt>
            <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
              {INITIAL_STAKE} {values.symbol}
            </dd>
          </div>
          <div>
            <dt className="text-prism-meta text-prism-ink-2">Creator share</dt>
            <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
              {values.share}%
            </dd>
          </div>
        </dl>
        {values.share >= 100 && (
          <p className="mt-3 text-prism-meta text-prism-ink-2">{FULL_SHARE_CARD}</p>
        )}
      </div>
    </article>
  );
}

/** Medium card (section 9) for the mobile sheet: art 110, title, one meta line. */
export function PoolPreviewMedium({ values }: { values: PreviewValues }) {
  const title = values.name.trim() || "Your pool";
  return (
    <article
      aria-label={`Preview of ${title}`}
      className="prism-glass-clear !rounded-prism-21 p-[8px] font-prism sm:hidden"
    >
      <Art image={values.image} className="h-[110px] w-full" />
      <div className="px-[13px] pb-[8px] pt-[13px]">
        <h3 className="line-clamp-1 break-words text-[16px] font-bold leading-[20px] text-prism-ink">
          {title}
        </h3>
        <p className="mt-1 line-clamp-1 text-prism-meta text-prism-ink-2">{byline(values)}</p>
        <p className="mt-1 flex justify-between gap-3 text-prism-meta tabular-nums text-prism-ink-2">
          <span>0 fans · {values.share}% creator share</span>
          <span>
            {INITIAL_STAKE} {values.symbol}
          </span>
        </p>
        {values.share >= 100 && (
          <p className="mt-2 text-prism-meta text-prism-ink-2">{FULL_SHARE_CARD}</p>
        )}
      </div>
    </article>
  );
}

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { STORE_COPY, usdcDollarsLabel, type StoreBlock } from "@repo/constants";
import { THEME_DEFAULTS, trpc, useAuth } from "@repo/ui";
import type { ThemeConfig } from "../../types/editor";

const B = STORE_COPY.block;

/**
 * The live preview's store block (board st10). It reads what visitors get
 * (store.listForBio), so until the store is live with an active product the
 * preview shows the heading and one line saying visitors do not see it yet.
 * Inert, like every preview block. The public renderer is
 * apps/landingpage/src/components/store/StoreBlock.tsx.
 */
export function StoreBlockPreview({
  block,
  theme,
}: {
  block: StoreBlock;
  theme: ThemeConfig | undefined;
}) {
  const { authUser } = useAuth();
  const handle = authUser?.handle ?? "";
  const store = useQuery({
    ...trpc.store.listForBio.queryOptions({ handle }),
    enabled: !!handle,
    staleTime: 60_000,
  });
  const data = store.data ?? null;
  const heading = block.config.label?.trim() || data?.name || B.name;

  const transparency = theme?.transparency ?? THEME_DEFAULTS.transparency;
  const alpha = Math.round(Math.max(transparency, 40) * 2.55)
    .toString(16)
    .padStart(2, "0");
  const button = theme?.buttonColor || THEME_DEFAULTS.buttonColor;
  const style = {
    backgroundColor: /^#[0-9a-f]{6}$/i.test(button) ? `${button}${alpha}` : button,
    color: theme?.fontColor || THEME_DEFAULTS.fontColor,
    fontFamily: theme?.fontFamily,
  };

  return (
    <section
      className={data ? "rounded-[21px] p-[21px]" : "rounded-[21px] p-[21px] opacity-60"}
      style={style}
      aria-label={heading}
    >
      <div className="mb-[13px] flex items-baseline justify-between gap-[13px]">
        <h2 className="min-w-0 truncate text-[20px] font-bold leading-[26px]">{heading}</h2>
        {data && (
          <span className="shrink-0 text-[14px] opacity-80">{B.count(data.productCount)}</span>
        )}
      </div>
      {!data ? (
        <p className="text-[14px] opacity-80">{store.isLoading ? "Loading" : B.notLive}</p>
      ) : (
        <>
          <ul className="flex gap-[13px] overflow-hidden">
            {data.products.map(card => (
              <li key={card.id} className="w-[120px] shrink-0">
                <div className="relative aspect-square overflow-hidden rounded-[13px] bg-black/10">
                  {card.cover && (
                    <img src={card.cover.src} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <p className="mt-[6px] line-clamp-2 text-[15px] font-semibold leading-[20px]">
                  {card.title}
                </p>
                <p className="text-[13px] opacity-80">{usdcDollarsLabel(card.amountUnits)}</p>
              </li>
            ))}
          </ul>
          <span className="mt-[13px] flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-current/25 text-[15px] font-semibold">
            {B.visitStore}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </span>
        </>
      )}
    </section>
  );
}

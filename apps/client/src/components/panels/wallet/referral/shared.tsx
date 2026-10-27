import { getChainConfig, getCurrencySymbol } from "@repo/web3";
import { AFFILIATES_CHAIN_ID } from "@repo/constants";
import { cn } from "@repo/ui";

// Screen Review 060: shared pieces of the Invite and referee cards.

export const REFERRALS_ARTICLE =
  "https://amplifydigital.freshdesk.com/a/solutions/articles/154000249731";

// Referral rewards are sent on the affiliates network, not the wallet's chain
export const REFERRAL_SYMBOL = getCurrencySymbol(AFFILIATES_CHAIN_ID);

export const UNAVAILABLE = "Unavailable right now. Check back later.";

export function txUrl(txid: string) {
  const explorer = getChainConfig(AFFILIATES_CHAIN_ID)?.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${txid}` : undefined;
}

export function shortTx(txid: string) {
  return `${txid.slice(0, 6)}…${txid.slice(-4)}`;
}

export function profileUrl(handle: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}`;
}

export function formatReward(amount: number | null | undefined) {
  return `${(amount ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${REFERRAL_SYMBOL}`;
}

// "12 Sep 2026", the same in every locale
export function formatJoined(value: string | Date) {
  const date = new Date(value);
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

// 34 avatar: the photo, else the initial on a G1 clear disc
export function Avatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={cn("h-[34px] w-[34px] shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "prism-glass-clear flex h-[34px] w-[34px] shrink-0 items-center justify-center !rounded-full text-prism-label font-bold text-prism-nav-pressed",
        className
      )}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

// The J5 line, as Rob approved it on 30 Sep (no amount)
export function walletsLine(handle: string | null | undefined, name: string) {
  return `You and ${handle ? `@${handle}` : name} each receive a tREVO bonus after you both connect a wallet.`;
}

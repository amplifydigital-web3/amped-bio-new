import { AtSign, ChevronRight, ShieldCheck } from "lucide-react";
import { cn } from "@repo/ui";
import { getRnsSuffix } from "@repo/web3";

// Shared parts of the Wallet RNS tab (Screen Review 101, 111).

/** 34 r8 tile: the avatar record, else the @ tile (#EFE7F8 with #6E3A82). */
export function NameTile({ src, size = 34 }: { src?: string | null; size?: 34 | 55 }) {
  const box =
    size === 55 ? "h-commit w-commit rounded-prism-13" : "h-[34px] w-[34px] rounded-prism-8";
  if (src) {
    return <img src={src} alt="" className={cn(box, "shrink-0 object-cover")} />;
  }
  return (
    <span
      aria-hidden
      className={cn(box, "inline-flex shrink-0 items-center justify-center bg-prism-value-panel-1")}
    >
      <AtSign className={size === 55 ? "h-[34px] w-[34px]" : "h-[21px] w-[21px]"} color="#6E3A82" />
    </span>
  );
}

/** An RNS name: the label in ink, the suffix from chain config in ink-2. */
export function RnsName({
  label,
  chainId,
  className,
}: {
  label: string;
  chainId?: number;
  className?: string;
}) {
  return (
    <span className={cn("break-words", className)}>
      {label}
      <span className="font-normal text-prism-ink-2">{getRnsSuffix(chainId)}</span>
    </span>
  );
}

/** 26 r8 badge (Primary, expiry warnings). */
export function RowBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warning";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-prism-8 px-2 text-prism-meta font-semibold",
        tone === "warning"
          ? "bg-prism-warning-bg text-prism-warning-ink shadow-[inset_0_0_0_1px_rgba(122,79,0,0.28)]"
          : "bg-white/90 text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]"
      )}
    >
      {children}
    </span>
  );
}

/** The Verified chip (shield check, indigo tint). */
export function VerifiedChip() {
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-prism-8 bg-prism-nav-tint px-2 text-prism-meta font-semibold text-prism-nav-pressed">
      <ShieldCheck aria-hidden className="h-4 w-4" />
      Verified
    </span>
  );
}

/** Section 9 G0 row 46: tile, name, meta, badges and a chevron; the whole row is a button. */
export function NameRow({
  label,
  chainId,
  avatar,
  meta,
  badges,
  onOpen,
}: {
  label: string;
  chainId?: number;
  avatar?: string | null;
  meta: React.ReactNode;
  badges?: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="prism-focus prism-dock-item flex min-h-[46px] w-full items-center gap-3 rounded-prism-8 py-2 text-left font-prism"
      >
        <NameTile src={avatar} />
        <span className="min-w-0 flex-1">
          <RnsName
            label={label}
            chainId={chainId}
            className="block truncate text-prism-label font-semibold text-prism-ink"
          />
          <span className="block text-prism-meta tabular-nums text-prism-ink-2">{meta}</span>
          {badges && <span className="mt-1 flex flex-wrap gap-1.5 sm:hidden">{badges}</span>}
        </span>
        {badges && <span className="flex shrink-0 gap-1.5 max-sm:hidden">{badges}</span>}
        <ChevronRight aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-3" />
      </button>
    </li>
  );
}

/** Skeleton rows 46, static under reduced motion. */
export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex h-[46px] items-center gap-3">
          <span className="h-[34px] w-[34px] rounded-prism-8 bg-prism-line motion-safe:animate-pulse" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3.5 w-40 rounded-full bg-prism-line motion-safe:animate-pulse" />
            <span className="block h-3 w-28 rounded-full bg-prism-line/70 motion-safe:animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}

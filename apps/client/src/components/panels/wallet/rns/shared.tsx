import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  ChevronRight,
  Clock,
  Plus,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Button, cn } from "@repo/ui";
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

/** 26 r8 badge (Primary, Active until, expiry warnings). */
export function RowBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warning" | "success";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-prism-8 px-2 text-prism-meta font-semibold",
        tone === "warning"
          ? "bg-prism-warning-bg text-prism-warning-ink shadow-[inset_0_0_0_1px_rgba(122,79,0,0.28)]"
          : tone === "success"
            ? "bg-white/90 text-prism-success shadow-[inset_0_0_0_1px_rgba(23,105,63,0.28)]"
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

/**
 * My RNS names card. The name page holds the profile, identity, renewal and
 * transfer, so every card carries a visible Manage button instead of relying
 * on a tap on the name. Expiring and grace states sit in a warning band at
 * the top of the card, with the renewal action next to Manage.
 */
export function NameCard({
  label,
  chainId,
  avatar,
  meta,
  badges,
  band,
  onManage,
  secondary,
}: {
  label: string;
  chainId?: number;
  avatar?: string | null;
  meta: React.ReactNode;
  badges?: React.ReactNode;
  band?: { text: string; tone: "warning" | "urgent" } | null;
  onManage: () => void;
  secondary?: { label: string; onClick: () => void; commit?: boolean } | null;
}) {
  const fullName = `${label}${getRnsSuffix(chainId)}`;
  return (
    <li className="prism-glass-clear flex flex-col overflow-hidden !rounded-prism-21 font-prism transition-[transform,box-shadow] duration-prism-hover ease-prism hover:-translate-y-0.5 hover:shadow-[inset_0_2px_0_#ffffff,0_0_0_1.5px_#5650a2,13px_34px_68px_rgba(48,47,93,0.26)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {band && (
        <p className="flex items-center gap-2 bg-prism-warning-bg px-[21px] py-2 text-prism-meta font-bold text-prism-warning-ink shadow-[inset_0_-1px_0_rgba(122,79,0,0.28)]">
          {band.tone === "urgent" ? (
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
          ) : (
            <Clock aria-hidden className="h-4 w-4 shrink-0" />
          )}
          {band.text}
        </p>
      )}
      <div className="flex flex-1 flex-col gap-[13px] p-[21px]">
        <div className="flex items-center gap-[13px]">
          <NameTile src={avatar} size={55} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-prism-panel-title text-prism-ink">
              <RnsName label={label} chainId={chainId} />
            </h3>
            <p className="mt-1 text-prism-meta tabular-nums text-prism-ink-2">{meta}</p>
          </div>
        </div>
        {badges && <div className="flex flex-wrap gap-1.5">{badges}</div>}
        <div className={cn("mt-auto grid gap-2", secondary && "grid-cols-2")}>
          <Button
            type="button"
            variant={secondary?.commit ? "secondary" : "default"}
            onClick={onManage}
          >
            <Settings aria-hidden />
            Manage
            <span className="sr-only"> {fullName}</span>
            {!secondary && <ArrowRight aria-hidden />}
          </Button>
          {secondary && (
            <Button
              type="button"
              variant={secondary.commit ? "commit" : "secondary"}
              onClick={secondary.onClick}
            >
              {secondary.label}
              <span className="sr-only"> {fullName}</span>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** The last tile of My RNS names: register another name. */
export function RegisterTile({ onClick }: { onClick: () => void }) {
  return (
    <li className="flex">
      <button
        type="button"
        onClick={onClick}
        className="prism-focus flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 rounded-prism-21 bg-white/30 font-prism text-prism-label font-bold text-prism-nav shadow-[inset_0_0_0_1.5px_rgba(86,80,162,0.4)] hover:bg-white/50"
      >
        <Plus aria-hidden className="h-[34px] w-[34px]" />
        Register another name
      </button>
    </li>
  );
}

import { Wallet } from "lucide-react";
import { cn } from "@repo/ui";

// Screen Review 067 to 069: shared components of the My Pool dashboard.

/** 34 avatar: the image, else the first letter on a lens disc, else a wallet icon. */
export function Avatar({
  src,
  handle,
  className,
}: {
  src?: string | null;
  handle?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-prism-label font-bold text-[#302F5D] shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]",
        className
      )}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : handle ? (
        handle.charAt(0).toUpperCase()
      ) : (
        <Wallet className="h-4 w-4 text-prism-value-ink" />
      )}
    </span>
  );
}

/** Section header row 44: eyebrow with marker, meta, optional control on the right. */
export function SectionHeader({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-3 border-b border-prism-line pb-2">
      <div className="flex min-w-0 items-baseline gap-3">
        <h2
          id={id}
          className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2"
        >
          <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
          {title}
        </h2>
        {meta && <span className="text-prism-meta tabular-nums text-prism-ink-2">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

/** Skeleton rows 55 in line color (shown only after 400ms by the caller). */
export function RowSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden className="divide-y divide-prism-line">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex h-[55px] items-center gap-3">
          <span className="h-[34px] w-[34px] rounded-full bg-prism-line" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-32 rounded-full bg-prism-line" />
            <span className="block h-2.5 w-20 rounded-full bg-prism-line" />
          </span>
          <span className="h-3 w-16 rounded-full bg-prism-line" />
        </li>
      ))}
    </ul>
  );
}

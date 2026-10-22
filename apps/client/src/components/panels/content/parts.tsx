import type * as React from "react";
import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  Eye,
  FileText,
  Loader,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@repo/ui";
import { CONTENT_COPY } from "./copy";
import { KIND_ICONS } from "./lib/labels";
import type { StatusTone } from "./lib/status";

/** "Later" for rules and tabs that arrive in a later PR (spec 3.16). */
export function LaterPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[21px] shrink-0 items-center rounded-full bg-prism-nav-tint px-2 text-prism-meta font-semibold text-prism-nav-pressed",
        className
      )}
    >
      {CONTENT_COPY.tabs.later}
    </span>
  );
}

// Status pills (cs1). Text colors are the Prism utility inks on light tints,
// each at or above 4.5:1; the icon carries the meaning with the word, never color alone.
const TONES: Record<StatusTone, { box: string; icon: LucideIcon }> = {
  public: { box: "bg-[#E3F1E8] text-prism-success", icon: Eye },
  draft: { box: "bg-[rgba(22,21,43,0.06)] text-prism-ink-2", icon: PencilLine },
  progress: { box: "bg-[rgba(22,21,43,0.06)] text-prism-ink-2", icon: Loader },
  review: { box: "bg-prism-warning-bg text-prism-warning-ink", icon: AlertTriangle },
  danger: { box: "bg-[#FBE9E7] text-prism-danger", icon: CircleX },
};

export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: StatusTone | "ready";
  label: string;
  className?: string;
}) {
  const style =
    tone === "ready" ? { box: "bg-[#E3F1E8] text-prism-success", icon: CircleCheck } : TONES[tone];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex h-[29px] shrink-0 items-center gap-1.5 rounded-prism-8 px-2.5 text-prism-meta font-semibold",
        style.box,
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

// Covers arrive with delivery URLs in PR 6; until then each kind has a tile
const TILE_BACKGROUND: Record<string, string> = {
  video:
    "bg-[radial-gradient(circle_at_30%_70%,rgba(255,179,138,0.35),transparent_45%),radial-gradient(circle_at_70%_30%,rgba(86,80,162,0.55),transparent_50%),#1C1B2E]",
  audio: "bg-[#1C1B2E]",
  image: "bg-[linear-gradient(135deg,#EDE6DA,#DCD3C4)]",
  document: "bg-[linear-gradient(135deg,#F1E9DD,#E6DACB)]",
  file: "bg-[#252436]",
  live: "bg-[#1C1B2E]",
};

const LIGHT_TILES = new Set(["image", "document"]);

export function KindTile({
  kind,
  badge,
  className,
  children,
}: {
  kind: string;
  badge?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const Icon = KIND_ICONS[kind] ?? FileText;
  const light = LIGHT_TILES.has(kind);
  return (
    <div
      className={cn(
        "relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-prism-13",
        TILE_BACKGROUND[kind] ?? "bg-[#1C1B2E]",
        className
      )}
    >
      {kind === "audio" ? (
        <span aria-hidden className="flex h-[55px] items-center gap-[6px]">
          {[28, 44, 34, 55, 30, 48, 36, 26].map((h, i) => (
            <span key={i} className="w-[8px] rounded-full bg-white/80" style={{ height: h }} />
          ))}
        </span>
      ) : (
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className={cn("h-[42px] w-[42px]", light ? "text-prism-ink-3" : "text-white/80")}
        />
      )}
      {badge && (
        <span className="absolute left-[10px] top-[10px] inline-flex h-[29px] items-center gap-1.5 rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold text-prism-ink">
          <Icon className="h-4 w-4" aria-hidden />
          {badge}
        </span>
      )}
      {children}
    </div>
  );
}

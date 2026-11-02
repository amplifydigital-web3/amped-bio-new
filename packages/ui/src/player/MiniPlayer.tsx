"use client";

/**
 * The mini player (Fan Library #26 phase A, board fl9). A 55 high bar that keeps
 * the current item playing while the viewer moves around: above the phone dock
 * and in the desktop context field footer in the editor, and at the foot of the
 * public site. It shows only after play started and while no full player for
 * the item is on screen.
 */
import * as React from "react";
import { Loader2, Pause, Play, X } from "lucide-react";
import { cn } from "../utils";
import { PLAYER_COPY as copy } from "./copy";
import { useOptionalPlayer } from "./PlayerProvider";
import type { PlayerItem } from "./types";

export function MiniPlayer({
  className,
  onExpand,
}: {
  className?: string;
  /** Opens the item's page. Without it the title is plain text. */
  onExpand?: (item: PlayerItem) => void;
}) {
  const player = useOptionalPlayer();
  if (!player?.item || player.fullPlayerShowing || !player.state.started) return null;
  const { item, state } = player;
  const duration = state.durationMs ?? item.durationMs ?? 0;
  const played = duration ? Math.min(100, (state.currentMs / duration) * 100) : 0;

  const title = (
    <>
      <span className="block truncate text-[14px] font-semibold leading-[18px]">{item.title}</span>
      {item.subtitle && (
        <span className="block truncate text-[12px] leading-[16px] text-white/75">
          {item.subtitle}
        </span>
      )}
    </>
  );

  return (
    <div
      role="region"
      aria-label={copy.miniPlayer}
      className={cn(
        "relative flex h-[55px] items-center gap-[8px] overflow-hidden rounded-[13px] bg-[#16152B] pl-[6px] pr-[2px] text-white shadow-[0_8px_24px_rgba(22,21,43,0.28)]",
        className
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-white/20">
        <span className="block h-full bg-white" style={{ width: `${played}%` }} />
      </span>
      <span className="h-[43px] w-[43px] shrink-0 overflow-hidden rounded-[8px] bg-white/10">
        {item.artwork && <img src={item.artwork} alt="" className="h-full w-full object-cover" />}
      </span>
      {onExpand ? (
        <button
          type="button"
          aria-label={copy.expand(item.title)}
          onClick={() => onExpand(item)}
          className="min-h-[44px] min-w-0 flex-1 rounded-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {title}
        </button>
      ) : (
        <span className="min-w-0 flex-1">{title}</span>
      )}
      <button
        type="button"
        aria-label={state.playing ? copy.pause : copy.play}
        onClick={player.toggle}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
      >
        {state.loading ? (
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : state.playing ? (
          <Pause className="h-5 w-5" aria-hidden />
        ) : (
          <Play className="h-5 w-5" aria-hidden />
        )}
      </button>
      <button
        type="button"
        aria-label={copy.close}
        onClick={player.close}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

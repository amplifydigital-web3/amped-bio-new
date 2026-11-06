"use client";

/**
 * The mini player (Fan Library #26, FL-1, board m7). A 64 high bar that keeps
 * the current item playing while the viewer moves around: above the phone dock
 * and in the desktop context field footer in the editor, and at the foot of the
 * public site. It shows only after play started and while no full player for
 * the item is on screen.
 *
 * No close button (spec 3.5). Tap or swipe up opens the full player; swipe
 * down stops and dismisses; swipe left plays next, swipe right previous. Each
 * gesture also has a visible button: the title opens, the player's More sheet
 * has Stop playing, the queue sheet has next and previous. Pause is the one
 * 52 px target.
 */
import * as React from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "../utils";
import { PLAYER_COPY as copy } from "./copy";
import { useOptionalPlayer } from "./PlayerProvider";
import { classifySwipe } from "./queue";
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
  const hintId = React.useId();
  const start = React.useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const swiped = React.useRef(false);
  if (!player?.item || player.fullPlayerShowing || !player.state.started) return null;
  const { item, state } = player;
  const duration = state.durationMs ?? item.durationMs ?? 0;
  const played = duration ? Math.min(100, (state.currentMs / duration) * 100) : 0;

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start.current = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      id: event.pointerId,
    };
    swiped.current = false;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const began = start.current;
    start.current = null;
    if (!began || began.id !== event.pointerId) return;
    const swipe = classifySwipe(
      event.clientX - began.x,
      event.clientY - began.y,
      performance.now() - began.t
    );
    if (!swipe || swipe === "tap") return;
    // A swipe never also counts as a tap on the button under the finger
    swiped.current = true;
    if (swipe === "down") player.stop();
    else if (swipe === "up") onExpand?.(item);
    else if (swipe === "left") player.next();
    else player.previous();
  };
  const swallowClickAfterSwipe = (event: React.MouseEvent) => {
    if (swiped.current) {
      event.preventDefault();
      event.stopPropagation();
      swiped.current = false;
    }
  };

  const title = (
    <>
      <span className="block truncate text-[15px] font-semibold leading-[20px]">{item.title}</span>
      {item.subtitle && (
        <span className="block truncate text-[13px] leading-[18px] text-white/80">
          {item.subtitle}
        </span>
      )}
    </>
  );

  return (
    <div
      role="region"
      aria-label={copy.miniPlayer}
      aria-describedby={hintId}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (start.current = null)}
      onClickCapture={swallowClickAfterSwipe}
      data-mini-player=""
      className={cn(
        "relative flex h-16 touch-none select-none items-center gap-[8px] overflow-hidden rounded-[13px] bg-[#16152B] pl-[8px] pr-[6px] text-white shadow-[0_8px_24px_rgba(22,21,43,0.28)]",
        className
      )}
    >
      <span id={hintId} className="sr-only">
        {copy.miniPlayerHint}
      </span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
        <span className="block h-full bg-white" style={{ width: `${played}%` }} />
      </span>
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[8px] bg-white/10">
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
        className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
      >
        {state.loading ? (
          <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : state.playing ? (
          <Pause className="h-6 w-6" aria-hidden />
        ) : (
          <Play className="h-6 w-6" aria-hidden />
        )}
      </button>
    </div>
  );
}

"use client";

/**
 * The player's sheets and lists (Fan Library #26, FL-1, boards m6, m7, d10 and
 * fl-q11-d2): Chapters and speed, More (with Report), Queue with Autoplay, the
 * sleep timer, keyboard shortcuts, and Up next from the creator.
 *
 * Sheets are the Prism bottom sheet: a platform surface over the creator's
 * look, so a fan always finds them in the same place. Every row is 55 high and
 * every icon button 44.
 */
import * as React from "react";
import {
  Airplay,
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkCheck,
  Captions,
  Flag,
  Gauge,
  GripVertical,
  Keyboard,
  ListEnd,
  ListMusic,
  ListOrdered,
  ListPlus,
  Moon,
  MoreHorizontal,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { PLAYER_SPEEDS } from "@repo/constants";
import { BottomSheet, BottomSheetContent } from "../prism/bottom-sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../dialog";
import { Switch } from "../Switch";
import { cn } from "../utils";
import { PLAYER_COPY as copy } from "./copy";
import { chapterIndexAt, formatClock, normalizeChapters, speedLabel, spokenClock } from "./format";
import { usePlayer } from "./PlayerProvider";
import { SLEEP_CHOICES, sleepMinutesLeft } from "./queue";
import type { PlayerItem, QueueEntry, SleepChoice, SourceResolver } from "./types";

const ROW =
  "flex min-h-[55px] w-full items-center gap-[13px] rounded-[13px] px-[13px] text-left text-[16px] text-prism-ink outline-none hover:bg-prism-ink/5 focus-visible:ring-2 focus-visible:ring-prism-nav disabled:opacity-50";
const ICON_BTN =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-prism-ink outline-none hover:bg-prism-ink/5 focus-visible:ring-2 focus-visible:ring-prism-nav disabled:opacity-40";
const CHIP =
  "inline-flex min-h-[44px] min-w-[55px] items-center justify-center rounded-full border border-prism-line-strong px-[13px] text-[16px] tabular-nums text-prism-ink outline-none focus-visible:ring-2 focus-visible:ring-prism-nav";

// ------------------------------------------------------------------ speed

function SpeedChoices({ rate, onPick }: { rate: number; onPick: (rate: number) => void }) {
  const headingId = React.useId();
  return (
    <div role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-[17px] font-semibold text-prism-ink">
        {copy.speedHeading}
      </h3>
      <div className="mt-[8px] flex flex-wrap gap-[8px]">
        {PLAYER_SPEEDS.map(speed => (
          <button
            key={speed}
            type="button"
            aria-pressed={rate === speed}
            aria-label={copy.speedOption(speedLabel(speed))}
            onClick={() => onPick(speed)}
            className={cn(CHIP, rate === speed && "border-2 border-prism-nav font-semibold")}
          >
            {speedLabel(speed)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ chapters and speed

/**
 * Chapters and speed (board m6, the settings gear and the Chapters button).
 * A chapter plays from its start: it seeks when the item is loaded, otherwise
 * it starts the item there.
 */
export function PlayerOptionsSheet({
  open,
  onOpenChange,
  item,
  resolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PlayerItem;
  resolve: SourceResolver;
}) {
  const player = usePlayer();
  const isCurrent = player.item?.id === item.id;
  const chapters = normalizeChapters(item.chapters, item.durationMs);
  const currentIndex =
    isCurrent && player.state.started ? chapterIndexAt(chapters, player.state.currentMs) : -1;
  const title = chapters.length ? copy.chapters : copy.speedHeading;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title}>
        {chapters.length > 0 && (
          <ol className="divide-y divide-prism-line">
            {chapters.map((chapter, index) => {
              const now = index === currentIndex;
              return (
                <li key={chapter.startMs}>
                  <button
                    type="button"
                    aria-label={copy.chapterAt(spokenClock(chapter.startMs), chapter.title)}
                    aria-current={now ? "true" : undefined}
                    onClick={() => {
                      if (isCurrent) {
                        player.seek(chapter.startMs);
                        player.play();
                      } else {
                        void player.load(item, resolve, {
                          autoplay: true,
                          startAtMs: chapter.startMs,
                        });
                      }
                      onOpenChange(false);
                    }}
                    className={ROW}
                  >
                    <span className="w-[55px] shrink-0 text-[15px] tabular-nums text-prism-ink-2">
                      {formatClock(chapter.startMs)}
                    </span>
                    <span className={cn("min-w-0 flex-1", now && "font-semibold")}>
                      {chapter.title}
                    </span>
                    {now && <Play className="h-5 w-5 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {isCurrent && (
          <div className={cn(chapters.length > 0 && "mt-[21px]", "pb-[8px]")}>
            <SpeedChoices rate={player.state.rate} onPick={player.setRate} />
          </div>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ more

export interface PlayerMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PlayerItem;
  resolve: SourceResolver;
  /** Opens the report dialog. Without it there is no Report row. */
  onReport?: () => void;
  /** A line at the foot, such as the downloads off line */
  note?: string | null;
}

/**
 * More (board fl-q11-d2): Play next and Add to queue when this item is not the
 * one playing; speed, captions, AirPlay and the sleep timer for the item
 * playing; Stop playing; Report, as on desktop.
 */
export function PlayerMoreSheet({
  open,
  onOpenChange,
  item,
  resolve,
  onReport,
  note,
}: PlayerMoreSheetProps) {
  const player = usePlayer();
  const isCurrent = player.item?.id === item.id;
  const live = isCurrent && player.state.started;
  const [panel, setPanel] = React.useState<"menu" | "speed" | "sleep">("menu");
  const [status, setStatus] = React.useState("");
  React.useEffect(() => {
    if (!open) {
      setPanel("menu");
      setStatus("");
    }
  }, [open]);
  const entry: QueueEntry = { item, resolve, canOpen: true };
  const captionLabel =
    player.state.captionIndex >= 0
      ? copy.captionsRowOn(player.captions[player.state.captionIndex]?.label ?? "")
      : copy.captionsRowOff;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={item.title}>
        {panel === "speed" ? (
          <div className="pb-[8px]">
            <SpeedChoices
              rate={player.state.rate}
              onPick={rate => {
                player.setRate(rate);
                setPanel("menu");
              }}
            />
          </div>
        ) : panel === "sleep" ? (
          <SleepChoices onDone={() => setPanel("menu")} />
        ) : (
          <div className="flex flex-col gap-[4px] pb-[8px]">
            {!isCurrent && (
              <>
                <button
                  type="button"
                  className={ROW}
                  onClick={() => {
                    if (player.playNext(entry)) setStatus(copy.addedNext);
                  }}
                >
                  <ListEnd className="h-5 w-5 shrink-0" aria-hidden />
                  {copy.playNext}
                </button>
                <button
                  type="button"
                  className={ROW}
                  onClick={() => {
                    if (player.addToQueue(entry)) setStatus(copy.addedToQueue);
                  }}
                >
                  <ListPlus className="h-5 w-5 shrink-0" aria-hidden />
                  {copy.addToQueue}
                </button>
              </>
            )}
            {live && (
              <>
                <button type="button" className={ROW} onClick={() => setPanel("speed")}>
                  <Gauge className="h-5 w-5 shrink-0" aria-hidden />
                  {copy.speedRow(speedLabel(player.state.rate))}
                </button>
                {player.captions.length > 0 && (
                  <button type="button" className={ROW} onClick={player.cycleCaptions}>
                    <Captions className="h-5 w-5 shrink-0" aria-hidden />
                    {captionLabel}
                  </button>
                )}
                {player.airplayAvailable && (
                  <button type="button" className={ROW} onClick={player.showAirplay}>
                    <Airplay className="h-5 w-5 shrink-0" aria-hidden />
                    {copy.airplay}
                  </button>
                )}
                <button type="button" className={ROW} onClick={() => setPanel("sleep")}>
                  <Moon className="h-5 w-5 shrink-0" aria-hidden />
                  {sleepRowLabel(player.sleep.choice, player.sleep.endsAt)}
                </button>
                <button
                  type="button"
                  className={ROW}
                  onClick={() => {
                    player.stop();
                    onOpenChange(false);
                  }}
                >
                  <Square className="h-5 w-5 shrink-0" aria-hidden />
                  {copy.stop}
                </button>
              </>
            )}
            {onReport && (
              <button
                type="button"
                className={ROW}
                onClick={() => {
                  onOpenChange(false);
                  onReport();
                }}
              >
                <Flag className="h-5 w-5 shrink-0" aria-hidden />
                {copy.report}
              </button>
            )}
            {note && <p className="px-[13px] pt-[8px] text-[15px] text-prism-ink-2">{note}</p>}
            <p role="status" className="px-[13px] text-[15px] text-prism-ink-2">
              {status}
            </p>
          </div>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}

function sleepRowLabel(choice: SleepChoice, endsAt: number | null): string {
  if (choice === "end") return copy.sleepAtEnd;
  const left = sleepMinutesLeft(endsAt);
  return left != null ? copy.sleepLeft(left) : copy.sleep;
}

// ------------------------------------------------------------------ sleep timer

function SleepChoices({ onDone }: { onDone?: () => void }) {
  const player = usePlayer();
  const headingId = React.useId();
  const label = (choice: SleepChoice) =>
    choice === "off" ? copy.sleepOff : choice === "end" ? copy.sleepEnd : copy.sleepMinutes(choice);
  return (
    <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-[4px] pb-[8px]">
      <h3 id={headingId} className="px-[13px] text-[17px] font-semibold text-prism-ink">
        {copy.sleep}
      </h3>
      {SLEEP_CHOICES.map(choice => {
        const on = player.sleep.choice === choice;
        return (
          <button
            key={String(choice)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              player.setSleepTimer(choice);
              onDone?.();
            }}
            className={cn(ROW, on && "font-semibold")}
          >
            <span
              aria-hidden
              className={cn(
                "h-5 w-5 shrink-0 rounded-full border-2",
                on ? "border-prism-nav bg-prism-nav" : "border-prism-line-strong"
              )}
            />
            {label(choice)}
          </button>
        );
      })}
    </div>
  );
}

/** The sleep timer on its own (the moon button on the audio player, board m7). */
export function SleepTimerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={copy.sleep} hideTitle>
        <SleepChoices onDone={() => onOpenChange(false)} />
      </BottomSheetContent>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ queue

function QueueRow({
  entry,
  index,
  count,
  onDragMove,
}: {
  entry: QueueEntry;
  index: number;
  count: number;
  onDragMove: (from: number, to: number) => void;
}) {
  const player = usePlayer();
  const rowRef = React.useRef<HTMLLIElement | null>(null);
  const drag = React.useRef<{ y: number; id: number } | null>(null);
  const [offset, setOffset] = React.useState(0);
  const title = entry.item.title;

  const end = (event: React.PointerEvent) => {
    const began = drag.current;
    drag.current = null;
    if (!began || began.id !== event.pointerId) return;
    const height = rowRef.current?.offsetHeight || 64;
    const steps = Math.round((event.clientY - began.y) / height);
    setOffset(0);
    if (steps) onDragMove(index, index + steps);
  };

  return (
    <li
      ref={rowRef}
      className="flex min-h-[64px] items-center gap-[4px] border-t border-prism-line first:border-t-0"
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
    >
      <button
        type="button"
        aria-label={copy.reorder(title)}
        className={cn(ICON_BTN, "cursor-grab touch-none active:cursor-grabbing")}
        onPointerDown={event => {
          drag.current = { y: event.clientY, id: event.pointerId };
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (drag.current?.id === event.pointerId) setOffset(event.clientY - drag.current.y);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={event => {
          if (event.key === "ArrowUp" && index > 0) {
            event.preventDefault();
            onDragMove(index, index - 1);
          } else if (event.key === "ArrowDown" && index < count - 1) {
            event.preventDefault();
            onDragMove(index, index + 1);
          }
        }}
      >
        <GripVertical className="h-5 w-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[16px] leading-[21px] text-prism-ink">{title}</p>
        <p className="text-[14px] tabular-nums text-prism-ink-2">
          {[entry.item.subtitle, entry.item.durationMs ? formatClock(entry.item.durationMs) : null]
            .filter(Boolean)
            .join(", ")}
        </p>
      </div>
      <button
        type="button"
        aria-label={copy.moveUp(title)}
        disabled={index === 0}
        onClick={() => onDragMove(index, index - 1)}
        className={ICON_BTN}
      >
        <ArrowUp className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={copy.moveDown(title)}
        disabled={index === count - 1}
        onClick={() => onDragMove(index, index + 1)}
        className={ICON_BTN}
      >
        <ArrowDown className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={copy.removeFromQueue(title)}
        onClick={() => player.removeFromQueue(entry.item.id)}
        className={ICON_BTN}
      >
        <Trash2 className="h-5 w-5" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Queue (board m7, middle): Autoplay, Now playing, the viewer's queue with drag
 * handles (and buttons for the same moves), then what autoplay would pick from
 * the creator. Next and Previous are here as buttons, for the mini player's
 * sideways swipes.
 */
export function QueueSheet({
  open,
  onOpenChange,
  creatorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the creator in the autoplay line */
  creatorName?: string | null;
}) {
  const player = usePlayer();
  const current = player.item;
  const autoplayId = React.useId();
  const queue = player.queue;
  const upcoming = player.upNext.filter(
    entry =>
      entry.canOpen &&
      entry.item.id !== current?.id &&
      !!current?.ownerId &&
      entry.item.ownerId === current.ownerId &&
      !queue.some(queued => queued.item.id === entry.item.id)
  );
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={copy.queue}>
        <div className="flex flex-col gap-[13px] pb-[8px]">
          <Switch
            id={autoplayId}
            checked={player.autoplay}
            onChange={player.setAutoplay}
            label={copy.autoplay}
            description={creatorName ? copy.autoplayNote(creatorName) : copy.autoplayNoteGeneric}
          />

          {current && (
            <section aria-label={copy.nowPlaying}>
              <h3 className="text-[17px] font-semibold text-prism-ink">{copy.nowPlaying}</h3>
              <div className="mt-[4px] flex min-h-[64px] items-center gap-[8px]">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[16px] font-semibold text-prism-ink">
                    {current.title}
                  </p>
                  <p className="text-[14px] tabular-nums text-prism-ink-2">
                    {copy.seekValue(
                      formatClock(player.state.currentMs),
                      formatClock(player.state.durationMs ?? current.durationMs)
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={player.previous}
                  disabled={!player.canPrevious}
                  className={cn(CHIP, "font-semibold")}
                >
                  {copy.previous}
                </button>
                <button
                  type="button"
                  onClick={player.next}
                  disabled={!player.canNext}
                  className={cn(CHIP, "font-semibold")}
                >
                  {copy.next}
                </button>
              </div>
            </section>
          )}

          <section aria-label={copy.queueNext}>
            <h3 className="text-[17px] font-semibold text-prism-ink">{copy.queueNext}</h3>
            {queue.length ? (
              <ol className="mt-[4px]">
                {queue.map((entry, index) => (
                  <QueueRow
                    key={entry.item.id}
                    entry={entry}
                    index={index}
                    count={queue.length}
                    onDragMove={(from, to) =>
                      to !== from && player.moveQueueEntry(from, Math.max(0, to))
                    }
                  />
                ))}
              </ol>
            ) : (
              <p className="mt-[4px] text-[15px] text-prism-ink-2">{copy.queueEmpty}</p>
            )}
          </section>

          {player.autoplay && upcoming.length > 0 && (
            <section aria-label={creatorName ? copy.upNextFrom(creatorName) : copy.upNext}>
              <h3 className="text-[17px] font-semibold text-prism-ink">
                {creatorName ? copy.upNextFrom(creatorName) : copy.upNext}
              </h3>
              <ol className="mt-[4px]">
                {upcoming.slice(0, 5).map(entry => (
                  <li key={entry.item.id} className="border-t border-prism-line first:border-t-0">
                    <button
                      type="button"
                      aria-label={copy.playItem(entry.item.title)}
                      onClick={() =>
                        void player.load(entry.item, entry.resolve, { autoplay: true })
                      }
                      className={ROW}
                    >
                      <span className="line-clamp-2 min-w-0 flex-1">{entry.item.title}</span>
                      {entry.item.durationMs ? (
                        <span className="text-[14px] tabular-nums text-prism-ink-2">
                          {formatClock(entry.item.durationMs)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ keyboard

/** Keyboard shortcuts behind one button (board d10, fl-q10-d2). */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{copy.keyboardShortcuts}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-[21px] gap-y-[8px] text-[16px]">
          {copy.shortcuts.map(([keys, action]) => (
            <React.Fragment key={keys}>
              <dt className="font-semibold">{keys}</dt>
              <dd>{action}</dd>
            </React.Fragment>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ up next

/**
 * Up next from the creator, under the player (boards m6, m7, d10). The list is
 * the page's up next entries for this item's creator that the viewer can
 * open; tapping one plays it now. The Autoplay switch is the provider's.
 */
export function UpNextList({
  item,
  creatorName,
  className,
}: {
  item: PlayerItem;
  creatorName: string;
  className?: string;
}) {
  const player = usePlayer();
  const headingId = React.useId();
  const entries = player.upNext.filter(
    entry =>
      entry.canOpen &&
      entry.item.id !== item.id &&
      !!item.ownerId &&
      entry.item.ownerId === item.ownerId
  );
  if (!entries.length) return null;
  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex min-h-[44px] items-center justify-between gap-[13px]">
        <h2 id={headingId} className="text-[18px] font-semibold">
          {copy.upNextFrom(creatorName)}
        </h2>
        <Switch
          checked={player.autoplay}
          onChange={player.setAutoplay}
          label={copy.autoplay}
          className="w-auto"
        />
      </div>
      <ol className="mt-[4px]">
        {entries.slice(0, 6).map(entry => (
          <li key={entry.item.id} className="border-t border-current/15 first:border-t-0">
            <button
              type="button"
              aria-label={copy.playItem(entry.item.title)}
              onClick={() => void player.load(entry.item, entry.resolve, { autoplay: true })}
              className="flex min-h-[64px] w-full items-center gap-[13px] py-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              <span className="relative h-[55px] w-[89px] shrink-0 overflow-hidden rounded-[8px] bg-black/20">
                {entry.item.artwork && (
                  <img src={entry.item.artwork} alt="" className="h-full w-full object-cover" />
                )}
                {entry.item.durationMs ? (
                  <span className="absolute bottom-[4px] right-[4px] rounded-[4px] bg-black/75 px-[4px] text-[13px] tabular-nums text-white">
                    {formatClock(entry.item.durationMs)}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[16px] leading-[21px]">{entry.item.title}</span>
                {entry.item.label && (
                  <span className="mt-[2px] block text-[14px] opacity-80">{entry.item.label}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ actions

const PILL =
  "inline-flex min-h-[44px] items-center justify-center gap-[8px] rounded-full border border-current px-[18px] text-[16px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2";

/**
 * The row under the player (boards m6 and fl-q10-d2). On phones: Save,
 * Chapters and More (More holds Report, speed, captions, AirPlay and the
 * sleep timer). On desktop: Save, Report, Keyboard shortcuts and Queue; the
 * chapters list sits beside the player there.
 *
 * Save shows only when the host saves (the Library API, FL-2); Report only
 * when the host reports. The row draws in currentColor, so it sits in the
 * creator's look on public pages.
 */
export function PlayerActions({
  item,
  resolve,
  saved = false,
  onSave,
  onReport,
  note,
  creatorName,
  className,
}: {
  item: PlayerItem;
  resolve: SourceResolver;
  saved?: boolean;
  onSave?: () => void;
  onReport?: () => void;
  /** A line in the More sheet, such as the downloads off line */
  note?: string | null;
  creatorName?: string | null;
  className?: string;
}) {
  const [chaptersOpen, setChaptersOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [keysOpen, setKeysOpen] = React.useState(false);
  const [queueOpen, setQueueOpen] = React.useState(false);
  const hasChapters = normalizeChapters(item.chapters, item.durationMs).length > 0;
  return (
    <div className={cn("flex flex-wrap items-center gap-[8px]", className)}>
      {onSave && (
        <button type="button" aria-pressed={saved} onClick={onSave} className={PILL}>
          {saved ? (
            <BookmarkCheck className="h-5 w-5" aria-hidden />
          ) : (
            <Bookmark className="h-5 w-5" aria-hidden />
          )}
          {saved ? copy.saved : copy.save}
        </button>
      )}
      {hasChapters && (
        <button
          type="button"
          onClick={() => setChaptersOpen(true)}
          className={cn(PILL, "md:hidden")}
        >
          <ListOrdered className="h-5 w-5" aria-hidden />
          {copy.chapters}
        </button>
      )}
      <button
        type="button"
        aria-label={copy.moreFor(item.title)}
        onClick={() => setMoreOpen(true)}
        className={cn(PILL, "w-11 px-0 md:hidden")}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
      {onReport && (
        <button type="button" onClick={onReport} className={cn(PILL, "hidden md:inline-flex")}>
          <Flag className="h-5 w-5" aria-hidden />
          {copy.report}
        </button>
      )}
      <button
        type="button"
        onClick={() => setKeysOpen(true)}
        className={cn(PILL, "hidden md:inline-flex")}
      >
        <Keyboard className="h-5 w-5" aria-hidden />
        {copy.keyboardShortcuts}
      </button>
      <button
        type="button"
        onClick={() => setQueueOpen(true)}
        className={cn(PILL, "hidden md:inline-flex")}
      >
        <ListMusic className="h-5 w-5" aria-hidden />
        {copy.queue}
      </button>

      <PlayerOptionsSheet
        open={chaptersOpen}
        onOpenChange={setChaptersOpen}
        item={item}
        resolve={resolve}
      />
      <PlayerMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        item={item}
        resolve={resolve}
        onReport={onReport}
        note={note}
      />
      <KeyboardShortcutsDialog open={keysOpen} onOpenChange={setKeysOpen} />
      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} creatorName={creatorName} />
    </div>
  );
}

"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CalendarClock, Clock } from "lucide-react";
import type { AnyThemeConfig } from "@repo/constants";
import { cn } from "../utils";
import { clampedFontSize, stillClasses } from "../creator/creator-button";
import { effectClassName, lookFor } from "../creator/look";
import { buttonSurfaceClass } from "../creator/surface";
import { countdownRowLine } from "./countdown-line";

// Block settings BS1 and CD1: the closed row a visitor sees for a block before
// it goes live with Show a countdown. The server sends the label and the start
// only (ScheduledBlockDto), so there is nothing to link to. The row wears the
// creator's button look but is not a link and not a button.

const MINUTE = 60_000;

function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export interface CountdownRowProps {
  /** A scheduled block DTO: the label and the start, nothing else */
  block: { config: { label: string }; scheduled: { start: string } };
  theme: AnyThemeConfig | null | undefined;
  /** Tests: a fixed clock and zone */
  now?: Date;
  visitorZone?: string;
}

export function CountdownRow({ block, theme, now: fixedNow, visitorZone }: CountdownRowProps) {
  const start = block.scheduled.start;
  const label = block.config.label;
  const look = lookFor(theme);
  // The server renders the start in UTC. After mount the line moves to the
  // visitor's zone. Same element, same size: no layout jump.
  const [zone, setZone] = useState<string | undefined>(visitorZone ?? "UTC");
  const [now, setNow] = useState<number>(() => (fixedNow ?? new Date()).getTime());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!visitorZone) setZone(browserZone());
    if (fixedNow) return;
    setNow(Date.now());
    // At most once a minute, and never after the start has passed
    const id = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= Date.parse(start)) clearInterval(id);
    }, MINUTE);
    return () => clearInterval(id);
  }, [start, fixedNow, visitorZone]);

  const line = countdownRowLine(start, new Date(now), zone);
  const rowStyle: CSSProperties = {
    backgroundColor: look.values.buttonColor,
    fontFamily: look.values.fontFamily,
    color: look.values.fontColor,
    // Closed, not pressable: a hairline in the text color instead of a hover
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${look.colors.text} 30%, transparent)`,
  };

  return (
    <div className="w-full" data-countdown-row="">
      <div
        className={cn(
          "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
          // The creator's button shape, still: the row is closed, so no hover or press
          stillClasses(effectClassName(look.button)),
          buttonSurfaceClass(look)
        )}
        style={rowStyle}
      >
        <Clock aria-hidden className="h-[21px] w-[21px] shrink-0" />
        <span
          className="line-clamp-2 flex-1 break-words text-center font-semibold"
          style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
        >
          {label}
        </span>
        <span aria-hidden className="w-[21px] shrink-0" />
      </div>
      <p
        className="mt-2 flex min-h-[20px] items-center justify-center gap-[5px] text-center text-[13px] leading-[20px]"
        style={{ fontFamily: look.values.fontFamily, color: look.colors.text }}
      >
        <CalendarClock aria-hidden className="h-[15px] w-[15px] shrink-0" />
        {/* The key swaps the text node after mount, so a server line in UTC
            never survives hydration in place of the visitor's line */}
        <span
          key={mounted ? "visitor" : "server"}
          className="min-w-0 truncate"
          title={line}
          suppressHydrationWarning
        >
          {line}
        </span>
      </p>
    </div>
  );
}

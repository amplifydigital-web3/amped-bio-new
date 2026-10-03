"use client";

import React, { useState } from "react";
import type { ThemeConfig } from "@repo/constants";
import { cn } from "@repo/ui";
import { getButtonBaseStyle, getButtonEffectStyle } from "@/lib/styles";

// Screen Review 040: shared pieces of the public block renderer. Blocks wear
// only the creator's theme (section 17). Amped contributes rhythm, sizes and
// rendering quality, never color.

/** Creator font size clamped to 16 to 20 (040 I06, I10). */
export function clampedFontSize(theme: ThemeConfig | undefined) {
  const raw = parseFloat(String(theme?.fontSize ?? "16"));
  const size = Number.isFinite(raw) ? Math.min(20, Math.max(16, raw)) : 16;
  return `${size}px`;
}

/** 039 I13: focus shows a 2px outline in the creator's text color. */
export const CREATOR_FOCUS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)]";

/**
 * 040 I06: one button anatomy for link, referral and pool calls to action.
 * Full column width, min 55, a 21 icon at left, the label centered on the
 * button (a 21 spacer at right balances the icon), two lines then truncate.
 */
export function CreatorButton({
  theme,
  icon,
  label,
  href,
  onClick,
  newTab = true,
}: {
  theme: ThemeConfig | undefined;
  icon?: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  newTab?: boolean;
}) {
  const className = cn(
    "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
    getButtonBaseStyle(theme?.buttonStyle),
    getButtonEffectStyle(theme?.buttonEffect),
    CREATOR_FOCUS
  );
  const style: React.CSSProperties = {
    backgroundColor: theme?.buttonColor,
    fontFamily: theme?.fontFamily,
    color: theme?.fontColor,
  };
  const content = (
    <>
      <span aria-hidden className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
        {icon}
      </span>
      <span
        className="line-clamp-2 flex-1 break-words text-center font-semibold"
        style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
      >
        {label}
        {href && newTab && <span className="sr-only"> (opens in a new tab)</span>}
      </span>
      <span aria-hidden className="w-[21px] shrink-0" />
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        onClick={onClick}
        className={className}
        style={style}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {content}
    </button>
  );
}

/** 040 I09: caption 16/26 in the creator's font and color, 8 below the embed. */
export function Caption({ text, theme }: { text?: string; theme: ThemeConfig | undefined }) {
  if (!text || text.trim() === "") return null;
  return (
    <p
      className="mt-2 text-left text-[16px] leading-[26px]"
      style={{ fontFamily: theme?.fontFamily, color: theme?.fontColor }}
    >
      {text}
    </p>
  );
}

/**
 * 040 I07: an r13 clipped frame at its final size before the embed loads,
 * with a skeleton until the iframe reports load. Every iframe gets a title.
 */
export function EmbedFrame({
  title,
  src,
  aspect,
  height,
  allow,
  caption,
  theme,
  allowFullScreen = false,
  scrolling,
}: {
  title: string;
  src: string;
  aspect?: string;
  height?: number;
  allow?: string;
  caption?: string;
  theme: ThemeConfig | undefined;
  allowFullScreen?: boolean;
  scrolling?: "no";
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <figure className="w-full">
      <div
        className="relative w-full overflow-hidden rounded-prism-13"
        style={aspect ? { aspectRatio: aspect } : { height }}
      >
        {!loaded && <EmbedSkeleton />}
        <iframe
          src={src}
          title={title}
          loading="lazy"
          allow={allow}
          allowFullScreen={allowFullScreen}
          scrolling={scrolling}
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      <Caption text={caption} theme={theme} />
    </figure>
  );
}

/** Fixed size placeholder: line fill, static under reduced motion. */
export function EmbedSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 bg-[rgba(22,21,43,0.10)] motion-safe:animate-pulse",
        className
      )}
    />
  );
}

/**
 * Third party embeds that size themselves (Instagram, Facebook, TikTok):
 * reserve 377 until the widget has measured itself (040 I07).
 */
export function SelfSizingFrame({
  title,
  minHeight = 377,
  caption,
  theme,
  children,
}: {
  title: string;
  minHeight?: number;
  caption?: string;
  theme: ThemeConfig | undefined;
  children: React.ReactNode;
}) {
  return (
    <figure className="w-full">
      <div
        role="group"
        aria-label={title}
        className="relative flex w-full justify-center overflow-hidden rounded-prism-13"
        style={{ minHeight }}
      >
        {children}
      </div>
      <Caption text={caption} theme={theme} />
    </figure>
  );
}

/** Label used in iframe titles: "<Platform> embed: <caption or label>". */
export function embedTitle(platform: string, caption?: string) {
  const detail = caption?.trim();
  return detail ? `${platform} embed: ${detail}` : `${platform} embed`;
}

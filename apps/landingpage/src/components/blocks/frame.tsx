"use client";

import React, { useState } from "react";
import type { ThemeConfig } from "@repo/constants";
import { cn } from "@repo/ui";

// Screen Review 040: shared pieces of the public block renderer. Blocks wear
// only the creator's theme (section 17). Amped contributes rhythm, sizes and
// rendering quality, never color.

// The button anatomy, the focus ring and the font size clamp moved to
// packages/ui/src/creator/creator-button.tsx in Theme Engine v2 phase 1b, so
// the editor preview draws the same button from the effect registry. The
// classes match the old style maps exactly (registry tests, #360).
export { CREATOR_FOCUS, CreatorButton, clampedFontSize } from "@repo/ui";

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

"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import { sanitizeRichHtml, type AnyThemeConfig } from "@repo/constants";
import { cn } from "../utils";
import {
  containerBackground,
  containerOn,
  effectClassName,
  lookCssVars,
  lookFontColor,
  lookFor,
  overlayParticlesId,
} from "./look";
import { ParticlesLayer } from "./particles-layer";
import { gradientScene, textureStyle } from "./scene";

/**
 * Theme Engine v2, phase 1b (docs/features/theme-engine-v2.md, 3.4): the one
 * creator page shell. The public page (ProfileView) and the editor preview
 * (Preview) both mount it behind SHOW_THEME_V2, so they draw the same theme
 * layers from the same registry and cannot drift (closes D10 from
 * docs/prism/batch-08-creator-page.md).
 *
 * It owns the theme layers: scene base, scene overlay, container surface, the
 * header (photo, name with its effect, bio) and the 610 column on the
 * Fibonacci rhythm (039 I06). Blocks, the footer and the frame chrome stay
 * with each app and come in as slots: the editor adds Fix chips and click
 * capture, the public page adds analytics, consent and the frame capsule.
 * The block kit (Build Board #54) moves blocks in later.
 *
 * Layout and classes match the public page as shipped (Screen Review 039 to
 * 041), so the public page renders the same with the flag on or off.
 */

/** QA-004: shows behind a video background until its first frame arrives. */
export const VIDEO_BACKDROP = "#14141C";

export type CreatorPageMode = "edit" | "preview" | "public";

/**
 * Which column sizes apply. The public page is responsive. The editor renders
 * inside a device frame on a wide screen, where the viewport breakpoints would
 * be wrong, so it names the device instead.
 */
export type CreatorPageSize = "responsive" | "phone" | "desktop";

// Literal class strings so Tailwind can see them
const SIZE: Record<CreatorPageSize, { column: string; pad: string; photo: string }> = {
  responsive: {
    column: "px-[21px] pt-[34px] sm:px-0 sm:pt-[55px]",
    pad: "p-[21px] sm:p-[34px]",
    photo: "h-[89px] w-[89px] rounded-full object-cover sm:h-[144px] sm:w-[144px]",
  },
  phone: {
    column: "px-[21px] pt-[34px]",
    pad: "p-[21px]",
    photo: "h-[89px] w-[89px] rounded-full object-cover",
  },
  desktop: {
    column: "px-0 pt-[55px]",
    pad: "p-[34px]",
    photo: "h-[144px] w-[144px] rounded-full object-cover",
  },
};

const DEFAULT_BOTTOM = "calc(89px + env(safe-area-inset-bottom, 0px))";

function isHtml(text: string) {
  return /<[a-z][\s\S]*>/i.test(text);
}

/** The creator's font and text color, for slots that set their own text (footer). */
export function creatorTextStyle(theme: AnyThemeConfig | null | undefined): CSSProperties {
  const look = lookFor(theme);
  return { fontFamily: look.values.fontFamily, color: lookFontColor(look) };
}

export interface CreatorPageProps {
  theme: AnyThemeConfig | null | undefined;
  mode: CreatorPageMode;
  size?: CreatorPageSize;
  /** Pause motion (041 I02): looping effects show their settled look. */
  paused?: boolean;
  profile: { name: string; photo?: string | null; bio?: string | null };
  /** Inline after the name inside the h1 (verified mark, Telegram mark). */
  nameExtras?: ReactNode;
  /** Under the name (the RNS identity chip). Wrapped and centered here. */
  identity?: ReactNode;
  /** The block list. Rendered 34 below the header, blocks 13 apart (040 I12). */
  blocks?: ReactNode;
  /** The footer, last inside the container. */
  footer?: ReactNode;
  /** Fixed chrome above the page (public frame capsule, consent card). */
  frame?: ReactNode;
  /**
   * Replaces the particle overlay. Phase 1c draws it here (ParticlesLayer on
   * tsParticles v4); this stays for tests and one off previews. It gets the v1
   * preset number of the overlay and the pause state.
   */
  renderOverlay?: (particlesEffect: number, paused: boolean) => ReactNode;
  videoRef?: Ref<HTMLVideoElement>;
  /** Padding under the column, for chrome that overlaps it (039 I16). */
  bottomPadding?: string;
}

export function CreatorPage({
  theme,
  mode,
  size = mode === "public" ? "responsive" : "phone",
  paused = false,
  profile,
  nameExtras,
  identity,
  blocks,
  footer,
  frame,
  renderOverlay,
  videoRef,
  bottomPadding = DEFAULT_BOTTOM,
}: CreatorPageProps) {
  const look = lookFor(theme);
  const sizes = SIZE[size];
  const background = look.values.background;
  const surface = containerOn(look);
  const textStyle = creatorTextStyle(theme);
  const particlesEffect = overlayParticlesId(look);
  const embedded = mode !== "public";
  // Phase 2 Background row: a built gradient may drift; a texture sits on top
  const gradient = gradientScene(background, paused);
  const texture = textureStyle(background);

  const backgroundLayer = (
    <div
      aria-hidden
      className={cn(embedded ? "absolute" : "fixed", "inset-0 z-0", gradient?.className)}
      // QA-004: set only the background shorthand. Pairing it with
      // backgroundColor makes React write background="" on the client,
      // which clears the color and the video backdrop.
      style={
        gradient?.style ?? {
          background:
            background?.type === "color"
              ? background.value || undefined
              : background?.type === "video"
                ? VIDEO_BACKDROP
                : undefined,
        }
      }
    >
      {background?.type === "video" ? (
        <video
          ref={videoRef}
          src={background.value || ""}
          poster={background.thumbnail || undefined}
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : background?.type === "image" ? (
        <div
          className="h-full w-full bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${background.value})` }}
        />
      ) : null}
      {texture && <div className="pointer-events-none absolute inset-0" style={texture} />}
      {renderOverlay ? (
        renderOverlay(particlesEffect, paused)
      ) : (
        <ParticlesLayer
          entry={particlesEffect === 0 ? null : look.overlay}
          params={look.overlayParams}
          colors={look.colors}
          paused={paused}
        />
      )}
    </div>
  );

  const column = (
    <div
      className={cn("relative z-[1] mx-auto w-full max-w-[610px]", sizes.column)}
      style={{ paddingBottom: bottomPadding }}
    >
      <div
        className={cn("w-full", surface && sizes.pad, effectClassName(look.container))}
        style={surface ? { backgroundColor: containerBackground(look) } : undefined}
      >
        <header className="flex flex-col items-center text-center">
          {/* 039 I08: one photo, compressed source first */}
          {profile.photo && (
            <img
              src={profile.photo}
              alt={profile.name}
              loading="eager"
              fetchPriority="high"
              className={sizes.photo}
              style={surface ? undefined : { boxShadow: "5px 13px 34px rgba(48,47,93,0.14)" }}
            />
          )}
          {/* 039 I07, 041 I05: name 26/33 700; only the name carries the effect */}
          <h1
            title={profile.name}
            className={cn(
              "line-clamp-3 break-words text-[26px] font-bold leading-[33px] tracking-normal",
              profile.photo && "mt-[21px]",
              effectClassName(look.name, paused)
            )}
            style={textStyle}
          >
            {profile.name}
            {nameExtras}
          </h1>
          {/* 109 I06, I07: the RNS chip in the creator font and color, never animated */}
          {identity && <div className="mt-2 flex justify-center">{identity}</div>}
          {/* 039 I07: bio 16/26 at the creator's full text color */}
          {profile.bio &&
            (isHtml(profile.bio) ? (
              <div
                className="mt-[13px] w-full text-[16px] leading-[26px] [&_a]:underline"
                style={textStyle}
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(profile.bio) }}
              />
            ) : (
              <p className="mt-[13px] w-full text-[16px] leading-[26px]" style={textStyle}>
                {profile.bio}
              </p>
            ))}
        </header>

        {/* 040 I12: blocks 13 apart; blocks add no margins of their own */}
        {blocks && <div className="mt-[34px] flex flex-col gap-[13px]">{blocks}</div>}

        {footer}
      </div>
    </div>
  );

  if (embedded) {
    // The editor: the scene stays put outside the scroller and fills the
    // device while the page scrolls inside it (QA-024)
    return (
      <div className="relative flex h-full flex-col" style={lookCssVars(look)}>
        {backgroundLayer}
        <div className="relative z-[1] flex-1 overflow-auto">{column}</div>
        {frame}
      </div>
    );
  }

  // 039 I05: the background is fixed to the viewport; the document scrolls
  return (
    <div className="relative min-h-dvh" style={lookCssVars(look)}>
      {backgroundLayer}
      {column}
      {frame}
    </div>
  );
}

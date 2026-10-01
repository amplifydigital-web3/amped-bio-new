import { useState, type CSSProperties, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn, themeCssVars } from "@repo/ui";
import type { ThemeConfig } from "@repo/constants";
import type { Background } from "@/types/editor";
import { getButtonBaseStyle, getContainerStyle } from "@/utils/styles";
import { backgroundThumb } from "./useDesign";

// Creator content inside Design tiles (section 17): the creator's own
// background, card, button, font and colors. Prism only frames it.

export function CreatorBackdrop({
  background,
  className,
  children,
  style,
}: {
  background?: Background;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const thumb = backgroundThumb(background);
  const isColor = background?.type === "color";

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden bg-[#14161C]", className)}
      style={{ ...(isColor ? { background: background?.value || undefined } : {}), ...style }}
    >
      {!isColor && thumb && !failed && (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {!isColor && !thumb && background?.type === "video" && background.value && (
        <video
          src={background.value}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* 023 I12: a thumbnail that fails to load shows G1 clear with an icon */}
      {!isColor && thumb && failed && (
        <div className="prism-glass-clear absolute inset-0 !rounded-none flex items-center justify-center">
          <ImageOff aria-hidden className="h-[34px] w-[34px] text-prism-ink-3" strokeWidth={1.5} />
        </div>
      )}
      {children && (
        <div className="relative flex h-full w-full items-center justify-center">{children}</div>
      )}
    </div>
  );
}

/** The creator's button as a specimen: 34 high, 70% of the tile (025 I01, 028 I02). */
export function ButtonSpecimen({
  config,
  buttonStyle,
  label,
  className,
}: {
  config: Partial<ThemeConfig>;
  buttonStyle: number;
  label: string;
  className?: string;
}) {
  return (
    <span
      style={{
        ...themeCssVars(config),
        backgroundColor: buttonStyle === 9 ? "transparent" : config.buttonColor,
        color: config.fontColor,
        fontFamily: config.fontFamily,
      }}
      className={cn(
        "flex h-[34px] w-[70%] items-center justify-center truncate px-3 text-[13px] font-semibold",
        getButtonBaseStyle(buttonStyle),
        className
      )}
    >
      {label}
    </span>
  );
}

/** A small page card in a container style, with text and button bars (024 I02). */
export function CardMiniature({
  config,
  containerStyle,
}: {
  config: Partial<ThemeConfig>;
  containerStyle: number;
}) {
  const alpha = Math.round(((config.transparency ?? 0) / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return (
    <span
      style={{
        ...themeCssVars(config),
        backgroundColor: config.containerColor ? `${config.containerColor}${alpha}` : undefined,
      }}
      className={cn(
        "flex w-[55%] flex-col items-center gap-1.5 !rounded-prism-8 p-2.5",
        getContainerStyle(containerStyle)
      )}
    >
      <span
        className="h-2 w-3/4 rounded-prism-5"
        style={{ backgroundColor: config.fontColor, opacity: 0.9 }}
      />
      <span
        className="h-2 w-1/2 rounded-prism-5"
        style={{ backgroundColor: config.fontColor, opacity: 0.6 }}
      />
      <span
        className="h-[13px] w-full rounded-prism-5"
        style={{ backgroundColor: config.buttonColor }}
      />
    </span>
  );
}

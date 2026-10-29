import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { ThemeConfig } from "@repo/constants";
import { THEME_DEFAULTS, cn, themeCssVars } from "@repo/ui";
import { getContainerStyle } from "@/lib/styles";
import { SITE_CONTENT_COPY as copy } from "./copy";

const VIDEO_BACKDROP = "#14141C";

/**
 * The creator's page frame for content pages (spec 3.7): their background,
 * font and container, as on the bio, around a wider column. Amped adds only
 * the Powered by line.
 */
export function ContentShell({
  theme,
  width = "narrow",
  children,
}: {
  theme: ThemeConfig | undefined;
  width?: "narrow" | "wide";
  children: ReactNode;
}) {
  const background = theme?.background;
  const fontColor = theme?.fontColor || THEME_DEFAULTS.fontColor;
  const containerOn = (theme?.containerStyle ?? 0) !== 0;
  const alpha = Math.round((theme?.transparency ?? THEME_DEFAULTS.transparency) * 2.55)
    .toString(16)
    .padStart(2, "0");
  return (
    <div
      className="relative min-h-dvh"
      style={{ ...themeCssVars(theme), "--amped-font": fontColor } as CSSProperties}
    >
      <div
        aria-hidden
        className="fixed inset-0 z-0"
        style={{
          background:
            background?.type === "color"
              ? background.value || undefined
              : background?.type === "video"
                ? VIDEO_BACKDROP
                : undefined,
        }}
      >
        {background?.type === "video" ? (
          <video
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
      </div>
      <div
        className={cn(
          "relative z-[1] mx-auto w-full px-[16px] pb-[calc(160px+env(safe-area-inset-bottom,0px))] pt-[21px] sm:pt-[34px]",
          width === "wide" ? "max-w-[1080px] sm:px-[34px]" : "max-w-[610px] sm:px-0"
        )}
        style={{ color: fontColor, fontFamily: theme?.fontFamily }}
      >
        <div
          className={cn(
            "w-full",
            containerOn && "p-[21px] sm:p-[34px]",
            getContainerStyle(theme?.containerStyle)
          )}
          style={containerOn ? { backgroundColor: `${theme?.containerColor}${alpha}` } : undefined}
        >
          {children}
          <p className="mt-[34px] text-center text-[14px]">
            {copy.poweredBy}{" "}
            <Link href="/" className="font-bold underline-offset-2 hover:underline">
              Amped.Bio
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

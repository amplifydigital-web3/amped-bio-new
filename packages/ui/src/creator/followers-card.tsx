import * as React from "react";
import type { FollowersBlockConfig, ThemeConfig } from "@repo/constants";
import { cn } from "../utils";
import { THEME_DEFAULTS } from "../theme-style";

/**
 * Followers block (Fan Graph phase 1c, Build Board #30), boards fb1, fb2 and
 * fb6. One card in the creator's theme shared by the public page and the
 * editor preview so the two never drift. Spec: docs/features/follow-blocks.md
 * section 3.5.
 *
 * The card wears only the creator's theme: surface in the button color at the
 * container transparency, text in the creator's font and color. No Prism
 * color, glass or rim (section 17). Rows render in a fixed order; the
 * configurator decides which exist, and `data` decides which have anything
 * to show. Every number here already passed the server's floor and hidden
 * rules, so a null field simply leaves its row out.
 */

export type FollowersCardFace = {
  name: string | null;
  handle: string | null;
  photo: string | null;
  poolFan: boolean;
};

export type FollowersCardData = {
  showCount: boolean;
  newOnAmped: boolean;
  followerCount: number | null;
  newInRange: number | null;
  series: number[] | null;
  faces: FollowersCardFace[];
  othersCount: number | null;
  poolFans: number | null;
  poolFanShare: number | null;
  milestone: number | null;
  sources: { kind: string; share: number }[] | null;
  poolAddress: string | null;
};

const numberFormat = new Intl.NumberFormat("en-US");

const SOURCE_LABELS: Record<string, string> = {
  page: "This page",
  explore: "Explore",
  qr: "QR code",
  pool: "Pool",
  broadcast: "Broadcast",
};

function milestoneLabel(milestone: number) {
  return milestone >= 1000 ? `${milestone / 1000}K followers` : `${milestone} followers`;
}

/** Hex alpha suffix for a 0 to 100 transparency, as the pool block uses. */
function alphaSuffix(transparency: number | undefined) {
  return Math.round((transparency ?? THEME_DEFAULTS.transparency) * 2.55)
    .toString(16)
    .padStart(2, "0");
}

/** A 30 point cumulative line, 89 by 21, in the font color (0.7 stroke, 0.12 fill). */
function Sparkline({ series, color, label }: { series: number[]; color: string; label: string }) {
  const width = 89;
  const height = 21;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = width / Math.max(1, series.length - 1);
  const points = series.map((value, index) => {
    const x = index * step;
    // 1px inset keeps the stroke inside the box at the extremes
    const y = height - 1 - ((value - min) / span) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
    >
      <polygon points={area} fill={color} fillOpacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeOpacity={0.7}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 34 avatar, or the follower's initial on the font color at 0.2. */
function Face({ face, color, ring }: { face: FollowersCardFace; color: string; ring: string }) {
  const initial = (face.name ?? "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold leading-[16px]"
      style={{
        boxShadow: `0 0 0 2px ${ring}`,
        backgroundColor: face.photo ? undefined : `${color}33`,
        color,
      }}
    >
      {face.photo ? (
        <img src={face.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </span>
  );
}

/**
 * "Jordan, Priya and 1,228 others follow" (design QA 2: two names at most).
 * The server sends at least three faces or none, so two names always fit.
 * While the count is hidden or under the floor, `othersCount` is null and the
 * line reads "and others follow" with no number at all (design QA 4).
 */
function facesSentence(
  faces: FollowersCardFace[],
  othersCount: number | null,
  linkTo: (face: FollowersCardFace) => React.ReactNode
) {
  const named = faces.slice(0, 2);
  const hasMore = faces.length > named.length || (othersCount ?? 0) > 0;
  const names = named.map((face, index) => (
    <React.Fragment key={index}>
      {index > 0 && (hasMore ? ", " : " and ")}
      {linkTo(face)}
    </React.Fragment>
  ));
  if (!hasMore) return <>{names} follow</>;
  if (othersCount === null) return <>{names} and others follow</>;
  const others = othersCount + (faces.length - named.length);
  return (
    <>
      {names} and {numberFormat.format(others)} {others === 1 ? "other follows" : "others follow"}
    </>
  );
}

export interface FollowersCardProps {
  config: FollowersBlockConfig;
  theme: ThemeConfig | undefined;
  /** Null while loading: the card shows a skeleton at its final size */
  data: FollowersCardData | null;
  /** The Follow button, supplied by the app (live on the page, inert in the preview) */
  followButton?: React.ReactNode;
  /** Link to a published fan page, or plain text when there is none */
  renderFaceLink?: (face: FollowersCardFace, text: string) => React.ReactNode;
  /** The View pool link, in the creator's font color */
  renderPoolLink?: (poolAddress: string) => React.ReactNode;
  className?: string;
}

export function FollowersCard({
  config,
  theme,
  data,
  followButton,
  renderFaceLink,
  renderPoolLink,
  className,
}: FollowersCardProps) {
  const fontColor = theme?.fontColor ?? THEME_DEFAULTS.fontColor;
  const text = { fontFamily: theme?.fontFamily, color: fontColor };
  const surface = `${theme?.buttonColor ?? THEME_DEFAULTS.buttonColor}${alphaSuffix(theme?.transparency)}`;
  const ring = theme?.containerColor ?? THEME_DEFAULTS.containerColor;

  if (!data) {
    return (
      <div
        aria-hidden
        className={cn(
          "h-[233px] w-full rounded-prism-13 bg-[rgba(22,21,43,0.10)] motion-safe:animate-pulse",
          className
        )}
      />
    );
  }

  const show = config.show;
  // The count line: the capsule's rule, same number format, same New on Amped.
  // With the count hidden by the creator the line is left out (no number
  // anywhere, design QA 4), and New on Amped is not used because it would
  // imply a count.
  const countLine = !data.showCount
    ? null
    : data.newOnAmped
      ? "New on Amped"
      : data.followerCount !== null
        ? `${numberFormat.format(data.followerCount)} followers`
        : null;
  const growth =
    show.count && data.newInRange !== null && data.newInRange > 0
      ? `+${numberFormat.format(data.newInRange)} ${config.growthRange === "30d" ? "in 30 days" : "this week"}`
      : null;
  const series = show.count && growth && data.series && data.series.length > 1 ? data.series : null;
  const faces = show.faces ? data.faces : [];
  const poolFans =
    show.poolFans && data.poolFans !== null && data.poolFans > 0 && data.poolAddress
      ? data.poolFans
      : null;
  const milestone = show.milestone && data.milestone !== null ? data.milestone : null;
  const sources = show.sources && data.sources && data.sources.length > 0 ? data.sources : null;

  const faceText = (face: FollowersCardFace) => face.name?.trim() || "A follower";
  const linkTo = (face: FollowersCardFace) =>
    renderFaceLink ? renderFaceLink(face, faceText(face)) : faceText(face);

  return (
    <section
      aria-label={config.title}
      className={cn("w-full space-y-[13px] rounded-prism-13 p-[21px]", className)}
      style={{ backgroundColor: surface, ...text }}
    >
      {/* Header: title 20/23 700 and the count line 16/20 600 tabular */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-[13px] gap-y-1">
        <h3 className="min-w-0 break-words text-[20px] font-bold leading-[23px]">{config.title}</h3>
        {countLine && (
          <p className="text-[16px] font-semibold leading-[20px] tabular-nums">{countLine}</p>
        )}
      </div>

      {growth && (
        <div className="flex items-center justify-between gap-[13px]">
          <p className="text-[16px] leading-[20px] tabular-nums">{growth}</p>
          {series && (
            <Sparkline
              series={series}
              color={fontColor}
              label={`Followers over the last 30 days, ${numberFormat.format(series[0])} to ${numberFormat.format(series[series.length - 1])}`}
            />
          )}
        </div>
      )}

      {faces.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul aria-label="Followers who chose to appear" className="flex items-center pl-0">
            {faces.map((face, index) => (
              <li
                key={`${face.handle ?? face.name ?? "f"}-${index}`}
                className={cn("list-none", index > 0 && "-ml-2")}
                style={{ zIndex: faces.length - index }}
              >
                <span className="sr-only">{faceText(face)}</span>
                <Face face={face} color={fontColor} ring={ring} />
              </li>
            ))}
          </ul>
          <p className="text-[16px] leading-[26px]">
            {facesSentence(faces, data.othersCount, linkTo)}
          </p>
        </div>
      )}

      {poolFans !== null && data.poolAddress && (
        <p className="flex flex-wrap items-baseline gap-x-[13px] text-[16px] leading-[20px]">
          <span className="tabular-nums">
            {numberFormat.format(poolFans)} {poolFans === 1 ? "follower" : "followers"} also{" "}
            {poolFans === 1 ? "stakes" : "stake"} in the pool
          </span>
          {renderPoolLink && <span className="shrink-0">{renderPoolLink(data.poolAddress)}</span>}
        </p>
      )}

      {milestone !== null && (
        <p>
          <span
            className="inline-flex min-h-[26px] items-center rounded-prism-8 px-2 text-[13px] font-semibold uppercase leading-[16px] tracking-[0.08em]"
            style={{ boxShadow: `inset 0 0 0 1px ${fontColor}4D` }}
          >
            {milestoneLabel(milestone)}
          </span>
        </p>
      )}

      {sources && (
        <div className="space-y-2">
          <p className="text-[13px] leading-[16px]">Where followers come from</p>
          <ul className="space-y-2 pl-0">
            {sources.map(source => {
              const percent = Math.round(source.share * 100);
              return (
                <li key={source.kind} className="list-none">
                  <div className="flex items-baseline justify-between gap-[13px] text-[13px] leading-[16px]">
                    <span>{SOURCE_LABELS[source.kind] ?? source.kind}</span>
                    <span className="tabular-nums">{percent}%</span>
                  </div>
                  <div
                    aria-hidden
                    className="mt-1 h-[5px] w-full overflow-hidden rounded-[3px]"
                    style={{ backgroundColor: `${fontColor}1F` }}
                  >
                    <div
                      className="h-full rounded-[3px]"
                      style={{ width: `${percent}%`, backgroundColor: `${fontColor}B3` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {config.followButton && followButton}
    </section>
  );
}

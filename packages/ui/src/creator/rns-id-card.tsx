import * as React from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import type { RnsIdBlockConfig, ThemeConfig } from "@repo/constants";
import { cn } from "../utils";
import { THEME_DEFAULTS } from "../theme-style";
import { formatRnsDate, RNS_IDENTITY_COPY, type RnsIdentity } from "../prism/rns-identity";

/**
 * RNS ID block (Build Board #33, Screen Review 112). One card in the
 * creator's theme shared by the public page and the editor preview, so the
 * two never drift. Four styles: Nameplate, ID Card, Proof Strip and Seal.
 *
 * The card renders only the fields in `identity`, which the server already
 * filtered by the binding rule, the owner's Page > RNS switches and the
 * block's Name on ID switch (112 D1, D2). It wears the creator's theme:
 * surface in the button color at the container transparency, text in the
 * creator's font and color. The only fixed colors are the Verified chip and
 * its check, a utility pair that passes 4.5:1 on light and dark themes.
 */

export const RNS_ID_COPY = {
  verified: RNS_IDENTITY_COPY.chip,
  linked: "Linked name",
  linkedTitle: "Linked name",
  verifiedTitle: RNS_IDENTITY_COPY.title,
  pointsHere: "Name points to this page",
  idChecked: "ID checked",
  nameOnId: RNS_IDENTITY_COPY.nameOnIdTitle,
  validUntil: (date: string) => `Valid until ${date}`,
  since: (month: string) => `On Amped since ${month}`,
  checkedOn: (date: string) =>
    `Authbase checked the ID of the person who runs this page on ${date}.`,
  checked: "Authbase checked the ID of the person who runs this page.",
  footnote: RNS_IDENTITY_COPY.footnote,
  fullDetails: "Full details",
  tapForDetails: "Tap for details",
  ringVerified: "REVOLUTION NAME SERVICE · VERIFIED · ",
  ringLinked: "REVOLUTION NAME SERVICE · LINKED NAME · ",
} as const;

const VERIFIED_BG = "#E6F2EA";
const VERIFIED_INK = "#0F4A2C";

/** Hex alpha suffix for a 0 to 100 transparency, as the pool block uses. */
function alphaSuffix(transparency: number | undefined) {
  return Math.round((transparency ?? THEME_DEFAULTS.transparency) * 2.55)
    .toString(16)
    .padStart(2, "0");
}

/** "2026-03" to "Mar 2026", in UTC so the server and the browser agree. */
export function formatSinceMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** The label and the suffix of an RNS name, for the two tone treatment. */
function splitName(name: string): { label: string; suffix: string } {
  const dot = name.indexOf(".");
  return dot === -1
    ? { label: name, suffix: "" }
    : { label: name.slice(0, dot), suffix: name.slice(dot) };
}

function RnsName({ name, color, className }: { name: string; color: string; className?: string }) {
  const { label, suffix } = splitName(name);
  return (
    <span className={cn("min-w-0 truncate font-bold", className)}>
      {label}
      {suffix && (
        <span className="font-medium" style={{ color: `${color}B3` }}>
          {suffix}
        </span>
      )}
    </span>
  );
}

/** The Verified chip (fixed utility colors) or the Linked name chip (theme). */
function StateChip({ verified, color }: { verified: boolean; color: string }) {
  if (verified) {
    return (
      <span
        className="inline-flex h-[24px] shrink-0 items-center gap-[5px] rounded-full pl-[7px] pr-[10px] text-[12px] font-bold leading-none"
        style={{ backgroundColor: VERIFIED_BG, color: VERIFIED_INK }}
      >
        <ShieldCheck aria-hidden className="h-[14px] w-[14px]" />
        {RNS_ID_COPY.verified}
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-[24px] shrink-0 items-center rounded-full px-[10px] text-[12px] font-semibold leading-none"
      style={{ backgroundColor: `${color}14`, color }}
    >
      {RNS_ID_COPY.linked}
    </span>
  );
}

/** A dashed stamp: bold claim over a small issuer line (ID Card). */
function Stamp({ title, line, color }: { title: string; line: string; color: string }) {
  return (
    <span
      className="inline-flex flex-col gap-[1px] rounded-prism-8 px-[10px] py-[5px]"
      style={{ backgroundColor: `${color}0F`, boxShadow: `inset 0 0 0 1px ${color}2E` }}
    >
      <span className="text-[12px] font-bold leading-[14px]">{title}</span>
      <span
        className="text-[10px] uppercase leading-[12px] tracking-[0.04em]"
        style={{ color: `${color}B3` }}
      >
        {line}
      </span>
    </span>
  );
}

/** A proof chip: check or link glyph, claim, issuer line (Proof Strip). */
function Proof({
  kind,
  title,
  line,
  color,
}: {
  kind: "verified" | "link";
  title: string;
  line: string;
  color: string;
}) {
  return (
    <span
      className="flex min-w-[104px] shrink-0 flex-col gap-[3px] rounded-[10px] px-[12px] py-2"
      style={{ backgroundColor: `${color}0F` }}
    >
      <span className="flex items-center gap-[5px] whitespace-nowrap text-[13px] font-bold leading-[16px]">
        {kind === "verified" ? (
          <ShieldCheck
            aria-hidden
            className="h-[14px] w-[14px] shrink-0"
            style={{ color: VERIFIED_INK }}
          />
        ) : (
          <Fingerprint aria-hidden className="h-[14px] w-[14px] shrink-0" />
        )}
        {title}
      </span>
      <span
        className="whitespace-nowrap text-[11px] leading-[13px]"
        style={{ color: `${color}B3` }}
      >
        {line}
      </span>
    </span>
  );
}

/** The seal: two rings, the name in the middle, the ring text around (Seal). */
function Seal({
  name,
  verified,
  color,
  id,
}: {
  name: string;
  verified: boolean;
  color: string;
  id: string;
}) {
  const { label, suffix } = splitName(name);
  const ring = verified ? RNS_ID_COPY.ringVerified : RNS_ID_COPY.ringLinked;
  const pathId = `rns-seal-${id}`;
  return (
    <svg viewBox="0 0 80 80" aria-hidden className="h-[72px] w-[72px] shrink-0" style={{ color }}>
      <defs>
        <path id={pathId} d="M40,40 m-30,0 a30,30 0 1,1 60,0 a30,30 0 1,1 -60,0" />
      </defs>
      <circle
        cx="40"
        cy="40"
        r="38"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <circle
        cx="40"
        cy="40"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <text fontSize="6.4" fontWeight="700" fill="currentColor" style={{ letterSpacing: "0.16em" }}>
        <textPath href={`#${pathId}`}>{ring}</textPath>
      </text>
      <text x="40" y="38" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">
        {label.toUpperCase()}
      </text>
      {suffix && (
        <text
          x="40"
          y="48"
          textAnchor="middle"
          fontSize="6"
          fill="currentColor"
          fillOpacity="0.7"
          style={{ letterSpacing: "0.08em" }}
        >
          {suffix.toUpperCase()}
        </text>
      )}
      {verified && (
        <>
          <circle cx="62" cy="18" r="9" fill={VERIFIED_INK} />
          <path
            d="M58 18.3l2.6 2.6 5-5.4"
            stroke={VERIFIED_BG}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

export interface RnsIdCardProps {
  config: RnsIdBlockConfig;
  theme: ThemeConfig | undefined;
  /** The page identity as getHandle returns it. Null renders nothing. */
  identity: RnsIdentity;
  displayName: string;
  avatarUrl?: string | null;
  /** The month the page joined, "YYYY-MM" (getHandle user.since) */
  since?: string | null;
  /** Inline tap: the facts are open under the block */
  expanded?: boolean;
  /** Tap on the block (sheet or inline). Omit for a static block. */
  onTap?: () => void;
  /** Opens the full identity sheet from the inline facts */
  onOpenSheet?: () => void;
  className?: string;
}

export function RnsIdCard({
  config,
  theme,
  identity,
  displayName,
  avatarUrl,
  since,
  expanded = false,
  onTap,
  onOpenSheet,
  className,
}: RnsIdCardProps) {
  const reactId = React.useId();
  if (!identity) return null;

  const fontColor = theme?.fontColor ?? THEME_DEFAULTS.fontColor;
  const text = { fontFamily: theme?.fontFamily, color: fontColor };
  const surface = `${theme?.buttonColor ?? THEME_DEFAULTS.buttonColor}${alphaSuffix(theme?.transparency)}`;

  const verified = identity.chip === "verified";
  const name = identity.name ?? null;
  const nameOrDisplay = name ?? displayName;
  const check = identity.check;
  const verifiedOn = check ? formatRnsDate(check.verifiedAt) : null;
  const validUntil = check ? formatRnsDate(check.validUntil) : null;
  const sinceMonth = config.show.since ? formatSinceMonth(since) : null;
  const nameOnId = verified && config.show.nameOnId ? (identity.nameOnId ?? null) : null;
  const interactive = !!onTap && config.tap !== "none";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  // The second line every style shares: the strongest true statement
  const sentence = verified
    ? `${verifiedOn ? RNS_ID_COPY.checkedOn(verifiedOn) : RNS_ID_COPY.checked}${nameOnId ? ` ${RNS_ID_COPY.nameOnId}: ${nameOnId}.` : ""}`
    : `${RNS_ID_COPY.pointsHere}.`;

  let body: React.ReactNode;
  if (config.style === "nameplate") {
    body = (
      <div className="flex min-h-[55px] items-center gap-[10px] py-[13px] pl-4 pr-[13px]">
        <span
          className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-prism-8"
          style={{ backgroundColor: `${fontColor}14` }}
        >
          <ShieldCheck aria-hidden className="h-[18px] w-[18px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="flex min-w-0 items-center gap-2 text-[16px] leading-[20px]">
            <RnsName name={nameOrDisplay} color={fontColor} />
            <StateChip verified={verified} color={fontColor} />
          </span>
          <span className="truncate text-[13px] leading-[16px]" style={{ color: `${fontColor}B3` }}>
            {nameOnId ? (
              <>
                {RNS_ID_COPY.nameOnId}:{" "}
                <b className="font-semibold" style={{ color: fontColor }}>
                  {nameOnId}
                </b>
              </>
            ) : (
              RNS_ID_COPY.pointsHere
            )}
          </span>
        </span>
      </div>
    );
  } else if (config.style === "idcard") {
    const sub = nameOnId
      ? `${RNS_ID_COPY.nameOnId}: ${nameOnId}`
      : verified
        ? RNS_IDENTITY_COPY.factTitle
        : RNS_ID_COPY.linked;
    body = (
      <div className="flex flex-col gap-[13px] p-4">
        <div className="flex items-start gap-[13px]">
          {config.show.avatar && (
            <span
              className="flex h-[55px] w-[55px] shrink-0 items-center justify-center overflow-hidden rounded-prism-13 text-[26px] font-bold"
              style={{ backgroundColor: `${fontColor}1F` }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span aria-hidden>{initial}</span>
              )}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span
              className="text-[11px] uppercase leading-[14px] tracking-[0.06em]"
              style={{ color: `${fontColor}B3` }}
            >
              {config.label}
            </span>
            <span className="break-words text-[18px] font-bold leading-[22px]">
              {config.show.displayName ? displayName : nameOrDisplay}
            </span>
            <span className="text-[13px] leading-[16px]" style={{ color: `${fontColor}B3` }}>
              {sub}
            </span>
            {sinceMonth && (
              <span className="text-[13px] leading-[16px]" style={{ color: `${fontColor}B3` }}>
                {RNS_ID_COPY.since(sinceMonth)}
              </span>
            )}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-2 pt-[13px]"
          style={{ borderTop: `1px solid ${fontColor}1A` }}
        >
          <RnsName name={nameOrDisplay} color={fontColor} className="text-[16px] leading-[20px]" />
          <StateChip verified={verified} color={fontColor} />
        </div>
        <div className="flex flex-wrap gap-[5px]">
          {verified && (
            <Stamp
              title={RNS_ID_COPY.idChecked}
              line={`Authbase${verifiedOn ? ` · ${verifiedOn}` : ""}`}
              color={fontColor}
            />
          )}
          <Stamp title={RNS_ID_COPY.pointsHere} line="RNS · on chain" color={fontColor} />
        </div>
        <div
          className="flex justify-between gap-2 text-[11px] leading-[14px]"
          style={{ color: `${fontColor}B3` }}
        >
          <span>
            {verified && validUntil
              ? RNS_ID_COPY.validUntil(validUntil)
              : verified
                ? RNS_ID_COPY.verified
                : "Not verified"}
          </span>
          {interactive && !expanded && <span>{RNS_ID_COPY.tapForDetails}</span>}
        </div>
      </div>
    );
  } else if (config.style === "proofstrip") {
    body = (
      <div className="flex flex-col gap-2 py-[13px] pl-4">
        <span
          className="flex items-center justify-between pr-[13px] text-[13px] font-semibold uppercase leading-[16px] tracking-[0.04em]"
          style={{ color: `${fontColor}B3` }}
        >
          {config.label}
        </span>
        <div className="flex gap-2 overflow-x-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {verified && (
            <Proof
              kind="verified"
              title="Verified ID"
              line={`Authbase${verifiedOn ? ` · ${verifiedOn}` : ""}`}
              color={fontColor}
            />
          )}
          {nameOnId && (
            <Proof kind="verified" title={RNS_ID_COPY.nameOnId} line={nameOnId} color={fontColor} />
          )}
          <Proof
            kind="link"
            title="Name points here"
            line={name ?? displayName}
            color={fontColor}
          />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex items-center gap-4 px-4 py-[13px]">
        <Seal
          name={nameOrDisplay}
          verified={verified}
          color={fontColor}
          id={reactId.replace(/[^a-zA-Z0-9]/g, "")}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[16px] font-bold leading-[20px]">
            {verified ? RNS_ID_COPY.verifiedTitle : RNS_ID_COPY.linkedTitle}
          </span>
          <span className="text-[13px] leading-[16px]" style={{ color: `${fontColor}B3` }}>
            {sentence}
          </span>
        </span>
      </div>
    );
  }

  const facts = expanded && config.tap === "inline" && (
    <div
      className="flex flex-col gap-2 px-4 pb-4 pt-[13px] text-[13px] leading-[18px]"
      style={{ borderTop: `1px solid ${fontColor}1A`, color: `${fontColor}B3` }}
    >
      {name && (
        <span className="flex justify-between gap-[13px]">
          <span>RNS name</span>
          <span className="text-right" style={{ color: fontColor }}>
            {name}
          </span>
        </span>
      )}
      <span className="flex justify-between gap-[13px]">
        <span>Points to</span>
        <span className="text-right" style={{ color: fontColor }}>
          this page&apos;s wallet
        </span>
      </span>
      {verified && (
        <span className="flex justify-between gap-[13px]">
          <span>ID checked by</span>
          <span className="text-right" style={{ color: fontColor }}>
            Authbase{verifiedOn ? `, ${verifiedOn}` : ""}
          </span>
        </span>
      )}
      {verified && validUntil && (
        <span className="flex justify-between gap-[13px]">
          <span>Valid until</span>
          <span className="text-right" style={{ color: fontColor }}>
            {validUntil}
          </span>
        </span>
      )}
      {nameOnId && (
        <span className="flex justify-between gap-[13px]">
          <span>{RNS_ID_COPY.nameOnId}</span>
          <span className="text-right" style={{ color: fontColor }}>
            {nameOnId}
          </span>
        </span>
      )}
      <span className="font-semibold" style={{ color: fontColor }}>
        {verified ? RNS_ID_COPY.footnote : RNS_IDENTITY_COPY.caution}
      </span>
      {onOpenSheet && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onOpenSheet();
          }}
          className="mt-1 flex h-[44px] w-full items-center justify-center rounded-[10px] text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ backgroundColor: `${fontColor}14`, color: fontColor }}
        >
          {RNS_ID_COPY.fullDetails}
        </button>
      )}
    </div>
  );

  const label = `${verified ? RNS_ID_COPY.verifiedTitle : RNS_ID_COPY.linkedTitle}, ${nameOrDisplay}`;
  const shell = cn("w-full rounded-prism-13 text-left", className);

  if (!interactive) {
    return (
      <section aria-label={label} className={shell} style={{ backgroundColor: surface, ...text }}>
        {body}
        {facts}
      </section>
    );
  }
  return (
    <div className={shell} style={{ backgroundColor: surface, ...text }}>
      <button
        type="button"
        onClick={onTap}
        aria-label={label}
        aria-expanded={config.tap === "inline" ? expanded : undefined}
        aria-haspopup={config.tap === "sheet" ? "dialog" : undefined}
        className="block w-full rounded-prism-13 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        style={text}
      >
        {body}
      </button>
      {facts}
    </div>
  );
}

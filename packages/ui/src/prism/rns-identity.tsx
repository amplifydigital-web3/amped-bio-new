"use client";
import { useEffect, useId, useState, type CSSProperties } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  Fingerprint,
  IdCard,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "../badge";
import { Button } from "../button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../dialog";
import { Switch } from "../Switch";
import { cn } from "../utils";
import { TESTNET_NOTICE } from "./states";

/**
 * Screen Review 109: the RNS chip on a creator page and the identity sheet it
 * opens. One component for the public page (landingpage ProfileView) and the
 * editor preview (client Preview), so the two never drift (D10, 109 I14).
 *
 * The server decides what may show (getHandle identity, 109 I01). This
 * component renders only the fields it receives.
 */

export type RnsIdentityCheck = {
  verifiedAt: string;
  validUntil: string;
  tier: "standard" | "enhanced";
};

export type RnsIdentity = {
  chip: "verified" | "name";
  name?: string;
  label?: string;
  wallet?: string;
  check?: RnsIdentityCheck;
  /** 112 D1: the name Authbase checked, only when the owner's RNS ID block shows it */
  nameOnId?: string;
} | null;

/**
 * 109 D1: counsel approved wording (3 Oct 2026). The claim is about the
 * person who runs the page, never about the typed display name.
 */
export const RNS_IDENTITY_COPY = {
  chip: "Verified",
  title: "Identity verified",
  body: (date: string | null) =>
    date
      ? `Authbase checked the ID of the person who runs this page on ${date}.`
      : "Authbase checked the ID of the person who runs this page.",
  factTitle: "ID checked by Authbase",
  factLine: (date: string) => `Valid until ${date}.`,
  footnote: "Verified means the identity check passed. It is not an endorsement.",
  linked: "This name points to this page's wallet.",
  caution: "Not verified. Check the address with the owner before you send. Names can look alike.",
  payTitle: "Pay by name",
  payLine: (name: string) => `Send tREVO to ${name} instead of a wallet address.`,
  nameOnIdTitle: "Name on ID",
  nameOnIdLine: (name: string) => `${name}, as checked by Authbase.`,
  detailsLabel: "Show details",
  detailsHelp: "The owner of this page chose to show them.",
  rnsLink: "View on Revolution Name Service",
} as const;

/** 12 Aug 2026, in UTC so the server and the browser agree */
export function formatRnsDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const shortWallet = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** 109 I07: the creator text color at 0.40 for the pill ring */
const ringFrom = (color?: string) =>
  color
    ? `inset 0 0 0 1px color-mix(in srgb, ${color} 40%, transparent)`
    : "inset 0 0 0 1px rgba(22,21,43,0.40)";

/** 109 I07 P01: a 21 check after the display name, in the creator color. The pill carries the label. */
export function RnsVerifiedMark({ className }: { className?: string }) {
  return <BadgeCheck aria-hidden className={cn("inline h-[21px] w-[21px] shrink-0", className)} />;
}

export interface RnsIdentityChipProps {
  identity: RnsIdentity;
  /** Sheet heading. Never part of a verification claim (109 D1). */
  displayName: string;
  avatarUrl?: string | null;
  fontFamily?: string;
  fontColor?: string;
  /** Opens Send with this recipient (/wallet?send=1&to=<label>), through sign in */
  sendHref?: string | null;
  /** NEXT_PUBLIC_RNS_URL or VITE_RNS_URL */
  rnsUrl?: string | null;
  /** Editor preview: the same sheet, with Send inert (109 I14) */
  readOnly?: boolean;
  className?: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
        className="prism-icon-btn prism-focus shrink-0"
      >
        {copied ? (
          <Check aria-hidden className="h-[21px] w-[21px] text-prism-success" />
        ) : (
          <Copy aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}

function DetailRow({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy?: { value: string; label: string };
}) {
  return (
    <div className="flex min-h-touch items-center gap-[13px] border-b border-prism-line px-[13px] last:border-b-0">
      <span className="text-prism-meta text-prism-ink-2">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-prism-label tabular-nums text-prism-ink">
        {value}
      </span>
      {copy && <CopyButton value={copy.value} label={copy.label} />}
    </div>
  );
}

function Fact({
  icon: Icon,
  title,
  line,
}: {
  icon: typeof ShieldCheck;
  title: string;
  line?: string;
}) {
  return (
    <div className="flex items-start gap-[13px]">
      <span className="prism-lens flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13">
        <Icon aria-hidden className="h-[21px] w-[21px] text-prism-nav" />
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-prism-label font-semibold text-prism-ink">{title}</p>
        {line && <p className="mt-0.5 text-prism-meta text-prism-ink-2">{line}</p>}
      </div>
    </div>
  );
}

export interface RnsIdentityDialogProps {
  identity: NonNullable<RnsIdentity>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sheet heading. Never part of a verification claim (109 D1). */
  displayName: string;
  avatarUrl?: string | null;
  /** Opens Send with this recipient (/wallet?send=1&to=<label>), through sign in */
  sendHref?: string | null;
  /** NEXT_PUBLIC_RNS_URL or VITE_RNS_URL */
  rnsUrl?: string | null;
  /** Editor preview: the same sheet, with Send inert (109 I14) */
  readOnly?: boolean;
}

/**
 * 109 I08: the identity sheet, a bottom sheet on phones and a 508 dialog
 * above. Opened by the header chip and by the RNS ID block (112 D3), so the
 * two never drift. Show details is never persisted (109 I11).
 */
export function RnsIdentityDialog({
  identity,
  open,
  onOpenChange,
  displayName,
  avatarUrl,
  sendHref,
  rnsUrl,
  readOnly = false,
}: RnsIdentityDialogProps) {
  const [details, setDetails] = useState(false);
  const detailsId = useId();

  useEffect(() => {
    if (!open) setDetails(false);
  }, [open]);

  const verified = identity.chip === "verified";
  const check = identity.check;
  const verifiedOn = check ? formatRnsDate(check.verifiedAt) : null;
  const validUntil = check ? formatRnsDate(check.validUntil) : null;
  const hasDetails = !!(identity.name || identity.wallet || check);
  const profileUrl = rnsUrl && identity.label ? `${rnsUrl}/#/profile/${identity.label}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[70dvh] duration-[377ms] ease-[cubic-bezier(0.2,0,0,1)] sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-center gap-[13px] pr-12">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-[55px] w-[55px] shrink-0 rounded-full object-cover"
            />
          ) : null}
          <p className="min-w-0 truncate text-prism-label font-semibold text-prism-ink">
            {displayName}
          </p>
        </div>

        <div className="space-y-2">
          {verified && (
            <Badge variant="success">
              <Check aria-hidden className="h-4 w-4" />
              {RNS_IDENTITY_COPY.chip}
            </Badge>
          )}
          <DialogTitle>{verified ? RNS_IDENTITY_COPY.title : identity.name}</DialogTitle>
          <DialogDescription>
            {verified ? RNS_IDENTITY_COPY.body(verifiedOn) : RNS_IDENTITY_COPY.linked}
          </DialogDescription>
          {!verified && (
            <p className="text-prism-meta font-semibold text-prism-warning-ink">
              {RNS_IDENTITY_COPY.caution}
            </p>
          )}
        </div>

        <div className="space-y-[13px]">
          {verified && (
            <Fact
              icon={ShieldCheck}
              title={RNS_IDENTITY_COPY.factTitle}
              line={validUntil ? RNS_IDENTITY_COPY.factLine(validUntil) : undefined}
            />
          )}
          {verified && identity.nameOnId && (
            <Fact
              icon={IdCard}
              title={RNS_IDENTITY_COPY.nameOnIdTitle}
              line={RNS_IDENTITY_COPY.nameOnIdLine(identity.nameOnId)}
            />
          )}
          {identity.name && (
            <Fact
              icon={Send}
              title={RNS_IDENTITY_COPY.payTitle}
              line={RNS_IDENTITY_COPY.payLine(identity.name)}
            />
          )}
        </div>

        {hasDetails && (
          <div className="space-y-2">
            <Switch
              checked={details}
              onChange={setDetails}
              label={RNS_IDENTITY_COPY.detailsLabel}
              description={RNS_IDENTITY_COPY.detailsHelp}
              aria-controls={detailsId}
            />
            {details && (
              <div id={detailsId} className="prism-glass-clear !rounded-prism-21 py-1">
                {identity.name && (
                  <DetailRow
                    label="RNS name"
                    value={identity.name}
                    copy={{ value: identity.name, label: `Copy ${identity.name}` }}
                  />
                )}
                {identity.wallet && (
                  <DetailRow
                    label="Wallet"
                    value={shortWallet(identity.wallet)}
                    copy={{ value: identity.wallet, label: "Copy wallet address" }}
                  />
                )}
                {check && verifiedOn && <DetailRow label="Checked on" value={verifiedOn} />}
                {check && validUntil && <DetailRow label="Valid until" value={validUntil} />}
                {check && (
                  <DetailRow
                    label="Check level"
                    value={check.tier === "enhanced" ? "Enhanced" : "Standard"}
                  />
                )}
                {check && <DetailRow label="Checked by" value="Authbase" />}
                {profileUrl && (
                  <div className="px-[5px] py-1">
                    <a
                      href={profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 px-2 text-prism-label font-semibold text-prism-nav hover:underline"
                    >
                      {RNS_IDENTITY_COPY.rnsLink}
                      <ExternalLink aria-hidden className="h-4 w-4" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(sendHref || readOnly) && (
          <div className="space-y-2">
            {sendHref && !readOnly ? (
              <Button variant="secondary" size="lg" className="w-full" asChild>
                <a href={sendHref}>
                  <Send aria-hidden />
                  <span className="truncate">Send tREVO to {displayName}</span>
                </a>
              </Button>
            ) : (
              <Button variant="secondary" size="lg" className="w-full" disabled>
                <Send aria-hidden />
                <span className="truncate">Send tREVO to {displayName}</span>
              </Button>
            )}
            <p className="text-center text-prism-meta text-prism-ink-2">{TESTNET_NOTICE}</p>
          </div>
        )}

        {verified && (
          <p className="text-prism-meta text-prism-ink-2">{RNS_IDENTITY_COPY.footnote}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 109 I06: one 44 pill button in the creator font and color, no hero effect.
 * Verified reads Verified; a linked name reads the RNS name. It opens the
 * identity sheet (I08).
 */
export function RnsIdentityChip({
  identity,
  displayName,
  avatarUrl,
  fontFamily,
  fontColor,
  sendHref,
  rnsUrl,
  readOnly = false,
  className,
}: RnsIdentityChipProps) {
  const [open, setOpen] = useState(false);

  if (!identity) return null;
  const verified = identity.chip === "verified";
  const chipStyle: CSSProperties = {
    fontFamily,
    color: fontColor,
    boxShadow: ringFrom(fontColor),
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={chipStyle}
        className={cn(
          "inline-flex h-touch min-w-0 max-w-full items-center gap-2 rounded-full pl-[13px] pr-4 text-[16px] font-semibold leading-[20px]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
          className
        )}
      >
        {verified ? (
          <ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />
        ) : (
          <Fingerprint aria-hidden className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{verified ? RNS_IDENTITY_COPY.chip : identity.name}</span>
      </button>
      <RnsIdentityDialog
        identity={identity}
        open={open}
        onOpenChange={setOpen}
        displayName={displayName}
        avatarUrl={avatarUrl}
        sendHref={sendHref}
        rnsUrl={rnsUrl}
        readOnly={readOnly}
      />
    </>
  );
}

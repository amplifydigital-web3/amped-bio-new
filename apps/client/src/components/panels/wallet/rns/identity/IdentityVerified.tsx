import { useId, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Lock, ShieldCheck } from "lucide-react";
import { Button, cn } from "@repo/ui";
import { formatRnsName } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { RNS_COPY } from "@/config/rns/copy";
import type { AuthbaseWalletStatus } from "@/types/authbase";
import { shortAddress } from "../format";
import { AUTHBASE_URL } from "./catalog";
import { IdEyebrow, MetaCell } from "./parts";
import { SharedAttributes } from "./SharedAttributes";
import { authbaseDate, renewalOpensAt } from "./dates";

type Verified = Extract<AuthbaseWalletStatus, { status: "VERIFIED" | "VERIFIED_WITH_BADGE" }>;

const TIER = { STANDARD: "Standard", ENHANCED: "Enhanced" } as const;

/**
 * Screen Review 104: Identity, verified (owner view). The job is done, so no
 * filled button while verification is current (I15). Renew is secondary and
 * disabled until the window opens, then the primary (I07). Where the badge
 * shows: the send row is locked on (110 D1); the page row arrives with the
 * Page profile settings (108, 12d) and the apps row with the Sign in claim (I08).
 */
export function IdentityVerified({
  label,
  chainId,
  status,
  explorer,
}: {
  label: string;
  chainId: number;
  status: Verified;
  explorer?: string;
}) {
  const fullName = formatRnsName(label, chainId);
  const tier = status.badge?.tier ?? status.verification.type;
  const wallet = status.authbase_wallet_address;
  const opensAt = renewalOpensAt(status.verification.valid_until);
  const renewOpen = !!opensAt && Date.now() >= opensAt.getTime();
  const lockHelpId = useId();

  const copy = () =>
    navigator.clipboard
      .writeText(wallet)
      .then(() => toast.add({ title: "Address copied", type: "success" }))
      .catch(() => undefined);

  return (
    <div className="space-y-[21px] font-prism">
      {/* P01 status card and P02 renew */}
      <section
        aria-labelledby="rns-verified-title"
        className="prism-glass-clear space-y-[21px] p-[21px] sm:p-[34px]"
      >
        <div className="flex flex-wrap items-start gap-[21px]">
          <span
            aria-hidden
            className="inline-flex h-[89px] w-[89px] shrink-0 items-center justify-center rounded-prism-21 bg-prism-nav-tint"
          >
            <ShieldCheck className="h-[55px] w-[55px] text-prism-nav-pressed" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <IdEyebrow>Identity</IdEyebrow>
            <h2
              id="rns-verified-title"
              className="text-[26px] font-bold leading-[33px] text-prism-ink"
            >
              {RNS_COPY.verifiedBy}
            </h2>
            <p className="text-prism-body text-prism-ink-2">
              The identity behind <span className="break-all">{fullName}</span> is checked. Your
              badge is live.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-[21px] gap-y-3 lg:grid-cols-4">
          <MetaCell label="Tier">{TIER[tier]}</MetaCell>
          <MetaCell label="Verified on">{authbaseDate(status.verification.verified_at)}</MetaCell>
          <MetaCell label="Valid until">{authbaseDate(status.verification.valid_until)}</MetaCell>
          <MetaCell label="Linked wallet">
            {shortAddress(wallet)}
            <button
              type="button"
              onClick={copy}
              aria-label={`Copy linked wallet ${shortAddress(wallet)}`}
              className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2"
            >
              <Copy aria-hidden className="h-[21px] w-[21px]" />
            </button>
          </MetaCell>
        </dl>
        <p className="text-prism-meta text-prism-ink-2">{RNS_COPY.verifiedDisclaimer}</p>
        {opensAt &&
          (renewOpen && AUTHBASE_URL ? (
            <Button asChild size="lg" className="max-sm:w-full">
              <a href={AUTHBASE_URL} target="_blank" rel="noopener noreferrer">
                Renew verification
                <ExternalLink aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" disabled aria-describedby="rns-renew-help">
                Renew
              </Button>
              <p id="rns-renew-help" className="text-prism-meta text-prism-ink-2">
                Renew opens {authbaseDate(opensAt)}, 30 days before{" "}
                {authbaseDate(status.verification.valid_until)}.
              </p>
            </div>
          ))}
      </section>

      <div className="grid items-start gap-[13px] lg:grid-cols-2">
        {/* P03 where your badge shows */}
        <section
          aria-labelledby="rns-badge-shows"
          className="prism-glass-clear space-y-[13px] p-[21px]"
        >
          <div id="rns-badge-shows">
            <IdEyebrow as="h3">Where your badge shows</IdEyebrow>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-prism-label font-semibold text-prism-ink">
                When people send to <span className="break-all">{fullName}</span>
              </p>
              <p id={lockHelpId} className="text-prism-meta text-prism-ink-2">
                Always shown. Senders need to know who they pay.
              </p>
            </div>
            <span className="flex h-touch shrink-0 items-center gap-1.5">
              <Lock aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
              <span
                role="checkbox"
                aria-checked="true"
                aria-disabled="true"
                aria-label={`Show the badge when people send to ${fullName}`}
                aria-describedby={lockHelpId}
                className="inline-flex h-6 w-6 items-center justify-center rounded-prism-5 bg-prism-value-deep"
              >
                <Check aria-hidden className="h-4 w-4 text-white" strokeWidth={3} />
              </span>
            </span>
          </div>
        </section>

        <SharedAttributes attributes={status.attributes} />
      </div>

      <BadgeDetails status={status} explorer={explorer} />
    </div>
  );
}

/** 104 I10: badge details in a disclosure; VERIFIED without a badge reads Badge being issued. */
function BadgeDetails({ status, explorer }: { status: Verified; explorer?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const badge = status.badge;

  if (!badge) {
    return (
      <div className="prism-glass-clear flex min-h-commit items-center justify-between gap-3 px-[21px]">
        <span className="text-prism-label font-semibold text-prism-ink">Badge details</span>
        <span className="text-prism-meta text-prism-ink-2">Badge being issued</span>
      </div>
    );
  }

  return (
    <div className="prism-glass-clear !rounded-prism-21">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className="prism-focus flex min-h-commit w-full items-center justify-between gap-3 rounded-prism-21 px-[21px] text-left text-prism-label font-semibold text-prism-ink"
      >
        Badge details
        <ChevronDown
          aria-hidden
          className={cn(
            "h-[21px] w-[21px] shrink-0 text-prism-ink-3 transition-transform duration-prism-control motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div
          id={panelId}
          className="flex flex-wrap items-center gap-x-[21px] gap-y-2 px-[21px] pb-[21px]"
        >
          <p className="text-prism-meta tabular-nums text-prism-ink-2">
            Token #{badge.token_id}, minted {authbaseDate(badge.minted_at)}
          </p>
          {explorer && badge.transaction_hash && (
            <Button asChild variant="ghost" className="-ml-3">
              <a
                href={`${explorer}/tx/${badge.transaction_hash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View transaction
                <ExternalLink aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { useId } from "react";
import { CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { formatRnsName, RNS_GRACE_PERIOD_SECONDS } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { RNS_FLAGS } from "@/config/rns/flags";
import { RNS_COPY } from "@/config/rns/copy";
import { formatRnsDate } from "../format";
import { NameTile, RnsName, RowBadge } from "../shared";
import { isBound, type RnsNameState } from "./useRnsName";

const DAY = 86_400;

/** 102 I05, I13, I25: one status badge from the registration expiry. */
export function ExpiryBadge({ name }: { name: RnsNameState }) {
  if (!name.expiry || !name.expiryState) return null;
  const now = Math.floor(Date.now() / 1000);
  if (name.expiryState === "active") {
    return <RowBadge tone="success">Active until {formatRnsDate(name.expiry)}</RowBadge>;
  }
  if (name.expiryState === "expiring") {
    const days = Math.max(1, Math.ceil((name.expiry - now) / DAY));
    return (
      <RowBadge tone="warning">
        Expires in {days} {days === 1 ? "day" : "days"}
      </RowBadge>
    );
  }
  return <RowBadge tone="warning">Expired on {formatRnsDate(name.expiry)}</RowBadge>;
}

/**
 * Screen Review 102 P02 to P05: the name page header, shared by every tab.
 * The display name is the bound Amped.Bio page's name, never an Authbase
 * attribute (I03). The Verified badge is a 44 target that opens Identity (I09).
 */
export function NameHeader({
  name,
  chainId,
  onOpenIdentity,
}: {
  name: RnsNameState;
  chainId: number;
  onOpenIdentity?: () => void;
}) {
  const fullName = formatRnsName(name.label, chainId);
  const badgeHelpId = useId();
  const bound = isBound(name);
  const person = bound ? name.person : null;
  const showVerified = RNS_FLAGS.identity && bound && name.verified === true;
  const showNotVerified = RNS_FLAGS.identity && name.isOwner && name.verified === false;

  const copy = () =>
    navigator.clipboard
      .writeText(fullName)
      .then(() => toast.add({ title: "Copied", type: "success" }))
      .catch(() => undefined);

  return (
    <section className="prism-glass-clear flex flex-wrap items-start gap-3 p-[21px] font-prism sm:flex-nowrap">
      <NameTile src={name.records.avatar} size={55} />
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="flex min-w-0 items-center gap-1 text-[26px] font-bold leading-[33px] text-prism-ink">
          <RnsName label={name.label} chainId={chainId} className="min-w-0 break-all" />
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${fullName}`}
            className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2"
          >
            <Copy aria-hidden className="h-[21px] w-[21px]" />
          </button>
        </h1>
        {(person || showVerified || showNotVerified) && (
          <div className="flex flex-wrap items-center gap-2">
            {person && (
              <span className="text-prism-label font-semibold text-prism-ink">{person.name}</span>
            )}
            {showVerified && (
              <button
                type="button"
                onClick={onOpenIdentity}
                aria-label={`${RNS_COPY.verifiedBy}. Open Identity`}
                aria-describedby={badgeHelpId}
                className="prism-focus -my-[9px] inline-flex h-touch items-center rounded-prism-8"
              >
                <span className="inline-flex h-[26px] items-center gap-1 rounded-prism-8 bg-prism-nav-tint px-2 text-prism-meta font-semibold text-prism-nav-pressed">
                  <ShieldCheck aria-hidden className="h-4 w-4" />
                  Verified
                </span>
                <span id={badgeHelpId} className="sr-only">
                  {RNS_COPY.verifiedDisclaimer}
                </span>
              </button>
            )}
            {showNotVerified && <RowBadge>Not verified</RowBadge>}
          </div>
        )}
        {name.isOwner && bound && person && (
          <p className="flex items-center gap-1.5 text-prism-meta text-prism-success">
            <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
            Linked to amped.bio/{person.handle}
          </p>
        )}
        {name.expiryState === "grace" && name.expiry && (
          <p className="text-prism-meta text-prism-warning-ink">
            Renew by {formatRnsDate(name.expiry + RNS_GRACE_PERIOD_SECONDS)} to keep it.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 max-sm:w-full sm:justify-end">
        <ExpiryBadge name={name} />
        {name.isPrimary && <RowBadge>Primary</RowBadge>}
      </div>
    </section>
  );
}

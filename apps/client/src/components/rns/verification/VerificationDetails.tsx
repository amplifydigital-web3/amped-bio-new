import { parseISO, isValid, format } from "date-fns";
import { Ban, Copy, ExternalLink } from "lucide-react";
import type {
  AuthbaseBadge,
  AuthbaseStatus,
  AuthbaseTier,
  AuthbaseVerification,
  AuthbaseWalletStatus,
} from "@/types/authbase";
import { scannerURL } from "@/utils/rns";
import { useAuthbaseIdentityStatus } from "@/hooks/rns/useAuthbaseIdentityStatus";

interface VerificationDetailProps {
  isOwner: boolean;
  ownerAddress?: string | null;
}

// Dynamic accents that vary per discriminator — used in SVG currentColor,
// runtime alpha composition, and computed hover states. Static colors like
// border / muted-surface use Tailwind arbitrary values inline, matching the
// rest of the codebase.

const TIER_META: Record<AuthbaseTier, { color: string; letter: string; label: string }> = {
  STANDARD: { color: "#2563EB", letter: "S", label: "Standard" }, // blue-600
  ENHANCED: { color: "#7E22CE", letter: "E", label: "Enhanced" }, // purple-700
};

type StatusMeta = {
  color: string;
  colorHover: string;
  eyebrow: string;
};

const STATUS_META: Record<AuthbaseStatus, StatusMeta> = {
  VERIFIED: {
    color: "#2563EB", // blue-600
    colorHover: "#1D4ED8", // blue-700
    eyebrow: "Verified",
  },
  VERIFIED_WITH_BADGE: {
    color: "#2563EB",
    colorHover: "#1D4ED8",
    eyebrow: "Verified · Badge issued",
  },
  NOT_VERIFIED: {
    color: "#6B7280", // gray-500 — neutral, matches NOT_LINKED badge
    colorHover: "#4B5563", // gray-600
    eyebrow: "Not verified",
  },
  NOT_LINKED: {
    color: "#6B7280", // gray-500 — neutral, matches existing NOT_LINKED pill
    colorHover: "#4B5563", // gray-600
    eyebrow: "Not linked",
  },
};

// ── Helpers ────────────────────────────────────────────────────
// A wallet carries an attestation record (VERIFIED*) — narrows the union so
// `verification` is non-null. Says nothing about current validity: an expired
// record is still VERIFIED* (gate on backend `verified` alongside this).
type AttestedStatus = Extract<AuthbaseWalletStatus, { status: "VERIFIED" | "VERIFIED_WITH_BADGE" }>;
const hasAttestation = (d: AuthbaseWalletStatus): d is AttestedStatus =>
  d.status === "VERIFIED" || d.status === "VERIFIED_WITH_BADGE";

// The tier to display: a minted badge's tier wins over the base attestation.
const attestedTier = (d: AttestedStatus): AuthbaseTier => d.badge?.tier ?? d.verification.type;

const formatDate = (iso: string): string => {
  const dt = parseISO(iso);
  return isValid(dt) ? format(dt, "MMM d, yyyy") : iso;
};

const shortAddress = (addr: string): string =>
  addr.length > 12 ? `${addr.slice(0, 6)}···${addr.slice(-4)}` : addr;

const shortHash = (hash: string): string =>
  hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

const buildMrz = (
  verification: AuthbaseVerification,
  holderAddress: string,
  tier: AuthbaseTier
): string => {
  const holder = `${holderAddress.slice(0, 6)}···${holderAddress.slice(-6)}`.toUpperCase();
  const compact = (iso: string): string => {
    const dt = parseISO(iso);
    return isValid(dt) ? format(dt, "yyyyMMdd") : iso;
  };
  const start = compact(verification.verified_at);
  const end = compact(verification.valid_until);
  return `REVO :: AUTHBASE :: ${holder} :: TIER-${TIER_META[tier].letter} :: ${start}/${end}`;
};

// ── Small building blocks ──────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B7280]">
        {label}
      </div>
      <div className="text-[14px] font-semibold text-[#020817] leading-snug break-words">
        {children}
      </div>
    </div>
  );
}

function CopyButton({ value, ariaLabel = "Copy" }: { value: string; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value)}
      className="inline-flex items-center justify-center h-5 w-5 rounded text-[#6B7280]/70 hover:text-[#020817] hover:bg-[#020817]/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function AddressMono({
  address,
  explorerType = "address",
  accentClass = "hover:text-[#2563EB]",
}: {
  address: string;
  explorerType?: "address" | "tx";
  accentClass?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[14px]">
      <a
        href={scannerURL(explorerType, address)}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-[#020817] transition-colors ${accentClass}`}
        title={address}
      >
        {shortAddress(address)}
      </a>
      <CopyButton value={address} ariaLabel={`Copy ${explorerType}`} />
    </span>
  );
}

function TierChip({ tier }: { tier: AuthbaseTier }) {
  const t = TIER_META[tier];
  return (
    <span className="inline-flex items-center gap-2">
      <span>{t.label}</span>
    </span>
  );
}

// ── Frame + header + MRZ footer ────────────────────────────────
function Certificate({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full px-3 sm:px-6 lg:px-8">
      <article
        className="relative bg-white rounded-2xl overflow-hidden border border-[#e2e8f0]"
        style={{
          boxShadow: "0 1px 0 rgba(2,8,23,0.03), 0 24px 60px -32px rgba(2,8,23,0.18)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-[6px] rounded-[14px] pointer-events-none border border-[#e2e8f0]/50"
        />
        {children}
      </article>
    </div>
  );
}

// A solid status pill. Color carries the semantic (blue = valid now,
// amber = action needed, gray = neutral, red = lookup failed).
type Pill = { label: string; color: string };

function StatusPill({ pill, loading }: { pill: Pill | null; loading?: boolean }) {
  if (loading) {
    return <span className="inline-block h-5 w-20 rounded-md bg-[#e2e8f0] animate-pulse" />;
  }
  if (!pill) {
    return <span className="text-[14px] font-semibold text-[#6B7280]">—</span>;
  }
  return (
    <span
      className="inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold text-white shadow transition-colors"
      style={{ background: pill.color }}
    >
      {pill.label}
    </span>
  );
}

function Header({ pill, loading }: { pill: Pill | null; loading?: boolean }) {
  return (
    <header className="relative px-4 sm:px-6 pt-8 pb-6 flex items-start justify-between gap-5">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6B7280] flex items-center gap-2 flex-wrap">
          <span>Authbase</span>
          <span className="w-4 h-px bg-[#6B7280]/50" />
          <span>Identity Verification</span>
        </div>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <span className="text-xl font-bold tracking-tight text-[#020817]">Status:</span>
          <StatusPill pill={pill} loading={loading} />
        </div>
      </div>
    </header>
  );
}

function MrzFooter({ line }: { line: string }) {
  return (
    <footer className="border-t border-[#e2e8f0] bg-[#f7f7f9]">
      <div className="px-4 sm:px-6 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[#6B7280] break-all leading-relaxed flex items-center gap-3">
        <span aria-hidden className="text-[#020817]/40">
          ▮ ▮ ▮
        </span>
        <span>{line}</span>
      </div>
    </footer>
  );
}

// ── Body: attested ─────────────────────────────────────────────
function AttestedBody({
  tier,
  verification,
  badge,
  holderAddress,
}: {
  tier: AuthbaseTier;
  verification: AuthbaseVerification;
  badge: AuthbaseBadge | null;
  holderAddress: string;
}) {
  return (
    <div className="px-4 sm:px-6 py-6">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
        <Field label="Tier">
          <TierChip tier={tier} />
        </Field>
        <Field label="Holder wallet">
          <AddressMono address={holderAddress} />
        </Field>
        <Field label="Verified on">{formatDate(verification.verified_at)}</Field>
        <Field label="Valid through">{formatDate(verification.valid_until)}</Field>
        {badge && (
          <>
            <Field label="Badge token">
              <span className="font-mono text-[14px] break-all">#{badge.token_id}</span>
            </Field>
            {/* Only shown once the badge is minted on-chain (tx hash present). */}
            {badge.transaction_hash && (
              <Field label="Badge transaction">
                <a
                  href={scannerURL("tx", badge.transaction_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-[14px] text-[#020817] transition-colors hover:text-[#2563EB]"
                  title={badge.transaction_hash}
                >
                  {shortHash(badge.transaction_hash)}
                  <ExternalLink className="h-3.5 w-3.5 text-[#6B7280]" />
                </a>
              </Field>
            )}
          </>
        )}
      </dl>
    </div>
  );
}

// ── Publicly shared attributes (consent-filtered PII) ──────────
// Independent of verification status: render whenever keys exist. Only keys
// present in `attributes` are shown; {} renders nothing. Absent ≠ denied, so
// there are no "denied" placeholders.
const humanizeKey = (key: string): string =>
  key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());

function AttributesSection({ attributes }: { attributes: Record<string, string> }) {
  const entries = Object.entries(attributes).filter(
    ([, value]) => value != null && String(value).trim() !== ""
  );
  if (entries.length === 0) return null;

  return (
    <div className="px-4 sm:px-6 pb-6">
      <div className="rounded-xl border border-[#e2e8f0] bg-[#f7f7f9] px-5 sm:px-6 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B7280]">
          Publicly shared attributes
        </div>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
          {entries.map(([key, value]) => (
            <Field key={key} label={humanizeKey(key)}>
              {String(value)}
            </Field>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ── Body: pending (not linked / unverified / expired) ──────────
// `expired` covers a wallet whose attestation exists but is no longer valid
// (status is VERIFIED* yet backend `verified` is false).
function PendingBody({
  isOwner,
  linkedAddress,
  expired,
}: {
  isOwner: boolean;
  linkedAddress: string | null;
  expired: boolean;
}) {
  const isLinked = linkedAddress !== null;
  const seal: StatusMeta = isLinked
    ? {
        ...STATUS_META.NOT_VERIFIED,
        eyebrow: expired ? "Verification expired" : STATUS_META.NOT_VERIFIED.eyebrow,
      }
    : STATUS_META.NOT_LINKED;

  const message = expired
    ? isOwner
      ? "Your Authbase verification has expired. Re-verify to restore your verified status."
      : "This wallet's Authbase verification has expired."
    : isOwner
      ? isLinked
        ? "Your wallet is linked to Authbase, but identity verification is not yet complete."
        : "This wallet is not yet linked to Authbase Verification."
      : isLinked
        ? "This wallet is linked to Authbase but has not yet completed identity verification."
        : "This wallet has not been linked to Authbase.";

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <div
        className="rounded-xl px-5 py-4 flex items-start gap-4 flex-wrap"
        style={{
          background: `${seal.color}0A`,
          border: `1px solid ${seal.color}26`,
        }}
      >
        <div className="flex-1 min-w-[220px]">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: seal.color }}
          >
            {seal.eyebrow}
          </div>
          <p className="mt-1.5 text-sm text-[#020817] leading-relaxed">{message}</p>
        </div>
        {isOwner && (
          <a
            href={import.meta.env.VITE_AUTHBASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors self-start"
            style={{ background: seal.color }}
            onMouseEnter={e => (e.currentTarget.style.background = seal.colorHover)}
            onMouseLeave={e => (e.currentTarget.style.background = seal.color)}
          >
            {expired ? "Re-verify" : isLinked ? "Complete KYC" : "Link to Authbase"}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Body: loading skeleton (matches field layout) ──────────────
function LoadingSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-[8px] w-20 rounded-full bg-[#e2e8f0]" />
            <div className="h-4 w-3/4 rounded-md bg-[#e2e8f0]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Body: error / no-address ───────────────────────────────────
function ErrorBody({ message }: { message: string }) {
  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="rounded-xl px-5 py-4 flex items-start gap-3 bg-red-50 border border-red-200">
        <Ban className="h-4 w-4 mt-0.5 text-red-700 shrink-0" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-700">
            Unable to verify
          </div>
          <p className="mt-1 text-sm text-[#020817]">{message}</p>
        </div>
      </div>
    </div>
  );
}

function NoAddressBody() {
  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="rounded-xl px-5 py-8 text-center bg-[#f7f7f9] border border-dashed border-[#e2e8f0]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6B7280]">
          Bearer unknown
        </div>
        <p className="mt-2 text-sm text-[#020817]">
          No wallet is currently associated with this name.
        </p>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
const VerificationDetail = ({ isOwner, ownerAddress }: VerificationDetailProps) => {
  const { data, isLoading, isError, error } = useAuthbaseIdentityStatus(ownerAddress);

  // Render off backend-derived `verified` / `hasBadge`. `status` narrows the
  // union (so `verification` / `badge` are non-null) but does NOT by itself
  // mean "currently valid" — an expired record is VERIFIED* with verified:false.
  const attested = !!data && data.verified && hasAttestation(data);
  // Linked-but-not-currently-valid: a linked wallet whose attestation expired.
  const expired = !!data && !data.verified && hasAttestation(data);

  // Status pill — one per outcome. Blue = valid now, amber = action needed,
  // gray = neutral, red = lookup failed. Never render a "verified" pill off
  // the raw status string (an expired record must read amber, not blue).
  const pill: Pill | null = isError
    ? { label: "Unavailable", color: "#B91C1C" } // red-700
    : !data
      ? ownerAddress
        ? null
        : { label: "No wallet", color: STATUS_META.NOT_LINKED.color }
      : attested
        ? {
            // Both verified-only and verified-with-badge read simply "Verified";
            // the badge case is distinguished by the Badge transaction field below.
            label: "Verified",
            color: STATUS_META.VERIFIED.color,
          }
        : expired
          ? { label: "Expired", color: STATUS_META.NOT_VERIFIED.color }
          : data.status === "NOT_LINKED"
            ? { label: "Not linked", color: STATUS_META.NOT_LINKED.color }
            : { label: "Not verified", color: STATUS_META.NOT_VERIFIED.color };

  const displayTier: AuthbaseTier | null = attested ? attestedTier(data) : null;
  const mrz =
    attested && displayTier
      ? buildMrz(data.verification, data.authbase_wallet_address, displayTier)
      : null;

  // Consent-filtered PII is independent of verification state — surface it in
  // every data-bearing outcome (verified, pending, expired, not-linked).
  const attributes = data?.attributes ?? {};

  return (
    <Certificate>
      <Header pill={pill} loading={isLoading} />
      <div className="mx-4 sm:mx-6 border-t border-dashed border-[#e2e8f0]" />

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorBody message={error?.message ?? "Could not load Authbase status."} />
      ) : attested ? (
        <AttestedBody
          tier={displayTier as AuthbaseTier}
          verification={data.verification}
          badge={data.badge}
          holderAddress={data.authbase_wallet_address}
        />
      ) : data ? (
        <PendingBody
          isOwner={isOwner}
          linkedAddress={data.authbase_wallet_address}
          expired={expired}
        />
      ) : (
        <NoAddressBody />
      )}

      {!isLoading && !isError && data && <AttributesSection attributes={attributes} />}

      {mrz && <MrzFooter line={mrz} />}
    </Certificate>
  );
};

export default VerificationDetail;

import { ExternalLink } from "lucide-react";
import {
  AUTHBASE_ATTRIBUTE_KEYS,
  AUTHBASE_ATTRIBUTE_LABELS,
  formatAuthbaseAttribute,
  type AuthbaseAttributeKey,
} from "@repo/constants";
import { Button } from "@repo/ui";
import { useAuthbasePublicAttributes } from "@/hooks/rns/useAuthbaseConfigured";
import { AUTHBASE_CONSENT_URL } from "./catalog";
import { IdEyebrow } from "./parts";

/** 079 D2 sharing line, approved wording. Only true while the server rule is on. */
export const PUBLIC_SHARING_LINE =
  "The owner shared these through Authbase. Anyone who views this name can see them.";
/** The published Privacy Policy line while attributes stay private to the owner. */
const PRIVATE_SHARING_LINE = "Only you can see these. Others see only your verification status.";
/** The owner's line while the rule is on: each detail still needs its RNS ID block switch. */
const OWNER_PUBLIC_SHARING_LINE =
  "Others see only the details you turn on in your page's RNS ID block.";
/** 079 D2: what the owner sees in this position before the status is Verified. */
export const NOT_VERIFIED_SHARING_LINE =
  "Details you share through Authbase appear here after your status is Verified.";

/**
 * Screen Review 079 D2 and I23 (with 104 I09): attributes the owner shared
 * through Authbase, under SHARED BY THE OWNER. Callers render this only for a
 * Verified status; never for Not verified or Not linked. Labels come from the
 * Authbase attribute catalog in @repo/constants, so raw keys never show.
 *
 * The owner reads every shared value from authbase.getMyStatus (104 D1).
 * Visitors get them only when the server turns on RNS_PUBLIC_ATTRIBUTES, and
 * only the ones the owner switched on in their RNS ID block.
 */
export function SharedAttributes({
  attributes,
  viewer = "owner",
}: {
  attributes: Record<string, string>;
  viewer?: "owner" | "visitor";
}) {
  const isPublic = useAuthbasePublicAttributes();
  const entries = Object.entries(attributes).filter(([, value]) => value);
  const labeled = AUTHBASE_ATTRIBUTE_KEYS.filter(key => attributes[key]).map(
    (key): [AuthbaseAttributeKey, string] => [key, attributes[key]]
  );
  const other = viewer === "owner" ? entries.length - labeled.length : 0;

  // I23: a visitor sees nothing when no approved attribute has a value
  if (viewer === "visitor" && labeled.length === 0) return null;

  return (
    <section
      aria-labelledby="rns-shared-title"
      className="prism-glass-clear space-y-[13px] p-[21px]"
    >
      <div id="rns-shared-title">
        <IdEyebrow as="h3">Shared by the owner</IdEyebrow>
      </div>
      {entries.length === 0 ? (
        <p className="text-prism-body text-prism-ink-2">
          No details shared with Amped.Bio. Manage sharing on Authbase.
        </p>
      ) : (
        <dl className="prism-slab divide-y divide-prism-line !rounded-prism-13">
          {labeled.map(([key, value]) => (
            <div
              key={key}
              className="flex min-h-touch items-center justify-between gap-4 px-4 py-2"
            >
              <dt className="text-prism-meta text-prism-ink-2">{AUTHBASE_ATTRIBUTE_LABELS[key]}</dt>
              <dd className="min-w-0 break-words text-right text-prism-label font-semibold text-prism-ink">
                {formatAuthbaseAttribute(key, value)}
              </dd>
            </div>
          ))}
          {other > 0 && (
            <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
              <dt className="text-prism-meta text-prism-ink-2">Other details</dt>
              <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
                {other}
              </dd>
            </div>
          )}
        </dl>
      )}
      <p className="text-prism-meta text-prism-ink-2">
        {viewer === "visitor"
          ? PUBLIC_SHARING_LINE
          : isPublic
            ? OWNER_PUBLIC_SHARING_LINE
            : PRIVATE_SHARING_LINE}
      </p>
      {viewer === "owner" && AUTHBASE_CONSENT_URL && (
        <Button asChild variant="ghost" className="-ml-3">
          <a href={AUTHBASE_CONSENT_URL} target="_blank" rel="noopener noreferrer">
            Manage on Authbase
            <ExternalLink aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      )}
    </section>
  );
}

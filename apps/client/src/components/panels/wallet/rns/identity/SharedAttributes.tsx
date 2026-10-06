import { ExternalLink } from "lucide-react";
import { Button } from "@repo/ui";
import { AUTHBASE_URL, SHARED_ATTRIBUTE_LABELS } from "./catalog";
import { IdEyebrow } from "./parts";

/**
 * Screen Review 104 P04 (and 103 I14): what the owner shared with Amped.Bio.
 * Owner only: the values come from authbase.getMyStatus, which the server
 * keys to the session wallet (104 D1). Keys Amped.Bio does not label are
 * counted, never shown raw (I09).
 */
export function SharedAttributes({ attributes }: { attributes: Record<string, string> }) {
  const entries = Object.entries(attributes).filter(([, value]) => value);
  const labeled = entries.filter(([key]) => SHARED_ATTRIBUTE_LABELS[key]);
  const other = entries.length - labeled.length;

  return (
    <section
      aria-labelledby="rns-shared-title"
      className="prism-glass-clear space-y-[13px] p-[21px]"
    >
      <div id="rns-shared-title">
        <IdEyebrow as="h3">Shared with Amped.Bio, private to you</IdEyebrow>
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
              <dt className="text-prism-label text-prism-ink-2">{SHARED_ATTRIBUTE_LABELS[key]}</dt>
              <dd className="min-w-0 break-words text-right text-prism-label font-semibold text-prism-ink">
                {value}
              </dd>
            </div>
          ))}
          {other > 0 && (
            <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
              <dt className="text-prism-label text-prism-ink-2">Other details</dt>
              <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
                {other}
              </dd>
            </div>
          )}
        </dl>
      )}
      <p className="text-prism-meta text-prism-ink-2">
        Only you can see these. Others see only your verification status.
      </p>
      {AUTHBASE_URL && (
        <Button asChild variant="ghost" className="-ml-3">
          <a href={AUTHBASE_URL} target="_blank" rel="noopener noreferrer">
            Manage on Authbase
            <ExternalLink aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      )}
    </section>
  );
}

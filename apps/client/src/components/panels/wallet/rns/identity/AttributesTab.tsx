import { Lock } from "lucide-react";
import { PLANNED_ATTRIBUTES } from "./catalog";
import { IdEyebrow, NotifyMe, SoonPill } from "./parts";

/**
 * Screen Review 105: Attributes, coming soon. A teaching tab: one definition,
 * one action (Notify me), the planned list and the rule that raw values never
 * leave. Shown to everyone (105 D1, Rob 3 Oct); Notify me and the not
 * verified line are for the owner.
 */
export function AttributesTab({
  isOwner,
  ownerVerified,
  onOpenIdentity,
}: {
  isOwner: boolean;
  ownerVerified: boolean | null;
  onOpenIdentity: () => void;
}) {
  return (
    <div className="space-y-[21px] font-prism">
      <section
        aria-labelledby="rns-attributes-title"
        className="prism-glass-clear space-y-3 p-[21px] sm:p-[34px]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <IdEyebrow>Attributes</IdEyebrow>
          <SoonPill>Coming soon</SoonPill>
        </div>
        <h2
          id="rns-attributes-title"
          className="text-[26px] font-bold leading-[33px] text-prism-ink"
        >
          Facts about you, held with your RNS name
        </h2>
        <p className="max-w-[640px] text-prism-body text-prism-ink-2">
          An attribute is a fact an issuer has checked, like your age or where you live. The issuer
          keeps the details. You decide who learns what, one fact at a time.
        </p>
        {isOwner && ownerVerified === false && (
          <p className="text-prism-meta text-prism-ink-2">
            Attributes start with a verified identity.{" "}
            <button
              type="button"
              onClick={onOpenIdentity}
              className="prism-focus inline-flex min-h-touch items-center font-semibold text-prism-nav underline-offset-4 hover:underline"
            >
              Go to Identity
            </button>
          </p>
        )}
        {isOwner && <NotifyMe source="attributes" />}
      </section>

      <ul aria-label="Planned attributes" className="grid gap-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {PLANNED_ATTRIBUTES.map(item => {
          const Icon = item.icon;
          return (
            <li key={item.key} className="prism-glass-clear space-y-3 p-[21px]">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 bg-prism-value-panel-1"
                >
                  <Icon className="h-[21px] w-[21px] text-prism-value-ink" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-prism-label font-semibold text-prism-ink">{item.label}</h3>
                  <p className="text-prism-meta text-prism-ink-2">From: {item.from}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.facets.map(facet => (
                  <span
                    key={facet}
                    className="inline-flex h-[26px] items-center rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold text-prism-ink-2 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]"
                  >
                    {facet}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="flex items-start gap-2 text-prism-meta text-prism-ink-2">
        <Lock aria-hidden className="mt-px h-[21px] w-[21px] shrink-0" />
        Attributes are never shown as raw values. Only facets you approve are shared.
      </p>
    </div>
  );
}

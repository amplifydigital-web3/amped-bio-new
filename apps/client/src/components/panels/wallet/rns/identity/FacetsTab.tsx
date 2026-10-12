import { ArrowDown, ArrowRight, BadgeCheck, CircleCheck, EyeOff } from "lucide-react";
import { PLANNED_FACETS, PLANNED_USES } from "./catalog";
import { IdEyebrow, NotifyMe, SoonPill } from "./parts";

const STEPS = [
  { title: "Issuer signs", body: "Authbase signs the facts it checked.", icon: BadgeCheck },
  {
    title: "Details stay with the issuer",
    body: "Your birthdate, ID number and address are not shared.",
    icon: EyeOff,
  },
  {
    title: "You approve one answer",
    body: "Each proof answers one question, is made for one request and expires.",
    icon: CircleCheck,
  },
];

/**
 * Screen Review 106: Facets in the placeholder phase. Hero with Notify me, how
 * a proof works, the owner's future facets (read only) and planned uses. No
 * switches and no proof log until facets are live (I03). The technical
 * caption waits for Authbase to confirm the proof scheme in writing (I01).
 */
export function FacetsTab({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="space-y-[21px] font-prism">
      <section
        aria-labelledby="rns-facets-title"
        className="prism-glass-clear space-y-3 p-[21px] sm:p-[34px]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <IdEyebrow>Facets</IdEyebrow>
          <SoonPill>Coming soon</SoonPill>
        </div>
        <h2 id="rns-facets-title" className="text-[26px] font-bold leading-[33px] text-prism-ink">
          Prove the match. Never publish the data.
        </h2>
        <p className="max-w-[640px] text-prism-body text-prism-ink-2">
          A facet answers one question about you, like Are you over 18. The answer comes with a zero
          knowledge proof. The app or person asking learns yes. They never see your birthdate, ID
          number or address.
        </p>
        {isOwner && <NotifyMe source="facets" />}
      </section>

      <section
        aria-labelledby="rns-proof-title"
        className="prism-glass-clear space-y-[21px] p-[21px]"
      >
        <div id="rns-proof-title">
          <IdEyebrow as="h3">How a proof works</IdEyebrow>
        </div>
        <ol className="flex flex-col gap-3 md:flex-row md:items-start">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="flex flex-1 flex-col gap-3 md:flex-row md:items-start"
              >
                <div className="flex flex-1 items-start gap-3">
                  <span
                    aria-hidden
                    className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 bg-prism-nav-tint"
                  >
                    <Icon className="h-[21px] w-[21px] text-prism-nav-pressed" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-prism-label font-semibold text-prism-ink">{step.title}</p>
                    <p className="mt-1 text-prism-meta text-prism-ink-2">{step.body}</p>
                  </div>
                </div>
                {index < STEPS.length - 1 && (
                  <>
                    <ArrowRight
                      aria-hidden
                      className="mt-3 hidden h-[21px] w-[21px] shrink-0 text-prism-ink-3 md:block"
                    />
                    <ArrowDown
                      aria-hidden
                      className="ml-3 h-[21px] w-[21px] shrink-0 text-prism-ink-3 md:hidden"
                    />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="rns-your-facets" className="space-y-[13px]">
        <div id="rns-your-facets">
          <IdEyebrow as="h3">{isOwner ? "Your facets" : "Facets"}</IdEyebrow>
        </div>
        <ul className="prism-glass-clear divide-y divide-prism-line !rounded-prism-21">
          {PLANNED_FACETS.map(facet => (
            <li
              key={facet.label}
              className="flex min-h-commit flex-wrap items-center justify-between gap-x-3 gap-y-1 px-[21px] py-2"
            >
              <div className="min-w-0">
                <p className="text-prism-label font-semibold text-prism-ink">{facet.label}</p>
                <p className="text-prism-meta text-prism-ink-2">{facet.from}</p>
              </div>
              <span className="inline-flex h-[26px] shrink-0 items-center rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold text-prism-ink-2 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]">
                Coming soon
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rns-planned-uses" className="space-y-[13px]">
        <div id="rns-planned-uses">
          <IdEyebrow as="h3">Planned uses</IdEyebrow>
        </div>
        <ul className="grid gap-[13px] sm:grid-cols-2 lg:grid-cols-3">
          {PLANNED_USES.map(use => (
            <li key={use.title} className="prism-glass-clear p-[21px]">
              <p className="text-prism-label font-semibold text-prism-ink">{use.title}</p>
              <p className="mt-1 text-prism-meta text-prism-ink-2">{use.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

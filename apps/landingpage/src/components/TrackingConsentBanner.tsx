"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@repo/ui";

export type ConsentChoice = { analytics: boolean; advertising: boolean };

function ChoiceSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  locked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  // Visit counting: a lock and Always on instead of a switch (039 I14)
  locked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-touch items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <label
          htmlFor={locked ? undefined : id}
          className="text-prism-label font-semibold text-prism-ink"
        >
          {label}
        </label>
        <p className="mt-0.5 text-prism-meta text-prism-ink-2">{description}</p>
      </div>
      {locked ? (
        <span className="flex shrink-0 items-center gap-1 text-prism-meta font-semibold text-prism-ink-2">
          <Lock aria-hidden className="h-[21px] w-[21px]" />
          Always on
        </span>
      ) : (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange?.(!checked)}
          className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-full disabled:opacity-60"
        >
          <span
            aria-hidden
            className={`relative h-6 w-11 rounded-full transition-colors duration-prism-control ${
              checked ? "bg-prism-nav" : "bg-[rgba(22,21,43,0.18)]"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-prism-control motion-reduce:transition-none ${
                checked ? "translate-x-5" : ""
              }`}
            />
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Consent banner for public creator pages. "Reject all" and "Accept all" carry
 * equal weight, nothing optional runs before a choice, and each category can be
 * set separately under "Choose".
 *
 * Screen Review 039 I14: Amped frame chrome, never the creator's colors. A G1
 * clear card r21, non modal (no focus trap, no focus steal), a region named by
 * its title. The page places it; every string is privacy copy, kept verbatim.
 */
export function TrackingConsentBanner({
  ownerName,
  adServices,
  adsBlockedByBrowser,
  initial,
  startExpanded = false,
  onSave,
  className,
}: {
  ownerName: string;
  // Services the creator connected, or empty when the creator has none
  adServices: string[];
  // The browser sent a Global Privacy Control signal
  adsBlockedByBrowser: boolean;
  initial: ConsentChoice;
  startExpanded?: boolean;
  onSave: (choice: ConsentChoice) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(initial.analytics);
  const [advertising, setAdvertising] = useState(initial.advertising && !adsBlockedByBrowser);
  const baseId = useId();
  const hasAds = adServices.length > 0;

  return (
    <section
      role="region"
      aria-labelledby={`${baseId}-title`}
      className={`prism-glass-clear prism-font mx-auto max-h-[70vh] w-full max-w-[508px] overflow-y-auto !rounded-prism-21 p-[21px] text-prism-ink ${className ?? ""}`}
    >
      <div>
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-ink-2" aria-hidden />
          <div className="min-w-0">
            <p id={`${baseId}-title`} className="text-prism-label font-bold text-prism-ink">
              Your privacy choices
            </p>
            <p className="mt-1 text-prism-body text-prism-ink-2">
              Amped Bio counts visits to this page without cookies. With your permission we also
              remember this browser, for up to 13 months, so {ownerName} can see return visits, and
              use Google Analytics to understand how Amped Bio is used.
              {hasAds && (
                <>
                  {" "}
                  {ownerName} also uses {adServices.join(", ")} to measure visits and show relevant
                  ads.
                </>
              )}{" "}
              You can change your choice at any time from the Privacy choices link on this page.
            </p>
            <button
              type="button"
              onClick={() => setDetails(open => !open)}
              aria-expanded={details}
              className="prism-btn-ghost prism-focus -ml-3 mt-1 inline-flex h-touch items-center gap-1 rounded-prism-13 px-3 text-prism-label font-semibold"
            >
              What is collected
              {details ? (
                <ChevronUp aria-hidden className="h-[21px] w-[21px]" />
              ) : (
                <ChevronDown aria-hidden className="h-[21px] w-[21px]" />
              )}
            </button>
            {details && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-prism-meta text-prism-ink-2">
                <li>
                  Always, without cookies: page views, link clicks, time on page, the site that sent
                  you, country and city, and device type. Your IP address is not stored.
                </li>
                <li>
                  Return visits, if you allow it: a random ID saved in your browser. It is linked to
                  your Amped Bio account only if you are signed in. It is deleted when you withdraw.
                </li>
                <li>
                  Amped Bio site analytics, if you allow it: Google Analytics sets its own cookies
                  and receives your IP address and device information. Its cookies are deleted when
                  you withdraw.
                </li>
                {hasAds && (
                  <li>
                    Ads and analytics by {ownerName}, if you allow it: {adServices.join(", ")} set
                    their own cookies and receive your IP address and device information.
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {expanded && (
          <div className="prism-slab mt-3 divide-y divide-prism-line">
            <ChoiceSwitch
              id={`${baseId}-necessary`}
              label="Visit counting"
              description="Cookieless counting that keeps this page working and measured. Always on."
              checked
              locked
            />
            <ChoiceSwitch
              id={`${baseId}-analytics`}
              label="Return visits and site analytics"
              description="Remember this browser so the creator can see returning visitors, and let Amped Bio use Google Analytics."
              checked={analytics}
              onChange={setAnalytics}
            />
            {hasAds && (
              <ChoiceSwitch
                id={`${baseId}-ads`}
                label={`Ads and analytics by ${ownerName}`}
                description={
                  adsBlockedByBrowser
                    ? "Off because your browser asked sites not to share or sell your data."
                    : `Loads ${adServices.join(", ")}.`
                }
                checked={advertising}
                disabled={adsBlockedByBrowser}
                onChange={setAdvertising}
              />
            )}
          </div>
        )}

        {/* Equal weight: two secondary lens buttons, neither primary */}
        <div className="mt-[13px] grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSave({ analytics: false, advertising: false })}
          >
            Reject all
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSave({ analytics: true, advertising: !adsBlockedByBrowser })}
          >
            Accept all
          </Button>
        </div>
        <div className="mt-[13px] flex justify-center">
          {expanded ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onSave({ analytics, advertising: advertising && !adsBlockedByBrowser })
              }
            >
              Save my choices
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setExpanded(true)}>
              Choose
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

export type ConsentChoice = { analytics: boolean; advertising: boolean };

function ChoiceSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-t border-gray-100 first:border-t-0">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-gray-900">
          {label}
        </label>
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-60 ${
          checked ? "bg-gray-900" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Consent banner for public creator pages. "Reject all" and "Accept all" carry
 * equal weight, nothing optional runs before a choice, and each category can be
 * set separately under "Choose".
 */
export function TrackingConsentBanner({
  ownerName,
  adServices,
  adsBlockedByBrowser,
  initial,
  startExpanded = false,
  onSave,
}: {
  ownerName: string;
  // Services the creator connected, or empty when the creator has none
  adServices: string[];
  // The browser sent a Global Privacy Control signal
  adsBlockedByBrowser: boolean;
  initial: ConsentChoice;
  startExpanded?: boolean;
  onSave: (choice: ConsentChoice) => void;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(initial.analytics);
  const [advertising, setAdvertising] = useState(initial.advertising && !adsBlockedByBrowser);
  const baseId = useId();
  const hasAds = adServices.length > 0;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-labelledby={`${baseId}-title`}
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div className="mx-auto max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-gray-200 p-4 text-gray-800">
        <div className="flex gap-3">
          <ShieldCheck className="w-5 h-5 shrink-0 text-gray-700 mt-0.5" aria-hidden />
          <div className="text-sm leading-relaxed">
            <p id={`${baseId}-title`} className="font-semibold text-gray-900">
              Your privacy choices
            </p>
            <p className="mt-1 text-gray-700">
              Amped Bio counts visits to this page without cookies. With your permission we also
              remember this browser, for up to 13 months, so {ownerName} can see return visits.
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
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gray-900 underline"
            >
              What is collected
              {details ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {details && (
              <ul className="mt-2 list-disc pl-4 text-xs text-gray-600 space-y-1">
                <li>
                  Always, without cookies: page views, link clicks, time on page, the site that sent
                  you, country and city, and device type. Your IP address is not stored.
                </li>
                <li>
                  Return visits, if you allow it: a random ID saved in your browser. It is linked to
                  your Amped Bio account only if you are signed in. It is deleted when you withdraw.
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
          <div className="mt-3 rounded-xl border border-gray-200 px-3">
            <ChoiceSwitch
              id={`${baseId}-necessary`}
              label="Visit counting"
              description="Cookieless counting that keeps this page working and measured. Always on."
              checked
              disabled
            />
            <ChoiceSwitch
              id={`${baseId}-analytics`}
              label="Return visits"
              description="Remember this browser so the creator can see returning visitors."
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

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSave({ analytics: false, advertising: false })}
            className="rounded-lg border border-gray-900 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={() => onSave({ analytics: true, advertising: !adsBlockedByBrowser })}
            className="rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Accept all
          </button>
        </div>
        <div className="mt-2 text-center">
          {expanded ? (
            <button
              type="button"
              onClick={() =>
                onSave({ analytics, advertising: advertising && !adsBlockedByBrowser })
              }
              className="text-sm font-medium text-gray-900 underline"
            >
              Save my choices
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-sm font-medium text-gray-900 underline"
            >
              Choose
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

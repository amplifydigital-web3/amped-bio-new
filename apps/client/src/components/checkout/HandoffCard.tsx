import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  HANDOFF_COPY,
  checkoutIntentIdSchema,
  checkoutPayPath,
  chromeIntentUrl,
  detectInAppBrowser,
  type InAppBrowser,
} from "@repo/constants";
import { Button } from "@repo/ui";
import { trackGAEvent } from "@/utils/ga";
import { isFeatureOn } from "@/config/featureFlags";

/**
 * The in app browser handoff (docs/features/mobile-checkout.md 7, board c4, PR CK-4).
 * iPhone: the two menu steps for the app the fan is in, with Copy link as the only
 * button (QA1). Android: Open in Chrome, an intent link, with Copy link below it.
 * Every link carries the checkout only. None of them signs anyone in.
 */
export function HandoffCard({ browser, link }: { browser: InAppBrowser; link: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const ios = browser.os === "ios";
  // A local http build has no intent link; the card falls back to Copy link
  const chromeHref = browser.os === "android" ? safeChromeIntent(link) : null;
  const android = chromeHref !== null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
      trackGAEvent("handoff_copy_link", "checkout", browser.app);
    } catch {
      setCopy("failed");
    }
  };

  const copyButton = (
    <Button
      type="button"
      size="lg"
      variant={android ? "secondary" : "default"}
      className="w-full"
      onClick={() => void copyLink()}
    >
      {copy === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copy === "copied" ? HANDOFF_COPY.copied : HANDOFF_COPY.copyLink}
    </Button>
  );

  return (
    <div className="prism-room flex min-h-dvh items-center justify-center px-[21px] py-[34px]">
      <main
        aria-labelledby="handoff-title"
        className="flex w-full max-w-[420px] flex-col gap-[21px] rounded-prism-21 bg-white p-[21px] font-prism text-[#16152B] shadow-[0_21px_55px_rgba(22,21,43,0.15)]"
      >
        <div className="flex flex-col gap-2">
          <h1 id="handoff-title" className="text-[21px] font-bold leading-7">
            {HANDOFF_COPY.title}
          </h1>
          <p className="text-[15px] leading-5 text-[#4A4766]">
            {HANDOFF_COPY.body(
              browser.app,
              ios ? "Safari" : browser.os === "android" ? "Chrome" : "your browser"
            )}
          </p>
        </div>

        {ios && (
          <ol className="flex flex-col gap-[13px]" aria-label="How to open your browser">
            {HANDOFF_COPY.iosSteps(browser.app).map((step, index) => (
              <Step key={step} number={index + 1}>
                {step}
              </Step>
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-[13px]">
          {android && (
            <Button asChild size="lg" className="w-full">
              <a
                href={chromeHref ?? undefined}
                onClick={() => trackGAEvent("handoff_open_chrome", "checkout", browser.app)}
              >
                <ExternalLink aria-hidden />
                {HANDOFF_COPY.openInChrome}
              </a>
            </Button>
          )}
          {ios && <p className="text-[14px] leading-5 text-[#4A4766]">{HANDOFF_COPY.orCopy}</p>}
          {copyButton}
          {android && (
            <p className="text-[14px] leading-5 text-[#4A4766]">{HANDOFF_COPY.androidHelp}</p>
          )}
          <p
            role="status"
            className="break-all rounded-prism-13 bg-[#F4F3FA] p-[13px] text-[13px] leading-[18px] text-[#4A4766]"
          >
            {copy === "failed" ? HANDOFF_COPY.copyFailed : link}
          </p>
          <p className="text-[13px] leading-[18px] text-[#4A4766]">{HANDOFF_COPY.linkLine}</p>
        </div>
      </main>
    </div>
  );
}

function safeChromeIntent(link: string): string | null {
  try {
    return chromeIntentUrl(link);
  } catch {
    return null;
  }
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex min-h-touch items-center gap-3 rounded-prism-13 border border-[#E4E2F0] p-[13px]">
      <span
        aria-hidden
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#16152B] text-[15px] font-bold text-white"
      >
        {number}
      </span>
      <span className="text-[16px] font-semibold leading-6">{children}</span>
    </li>
  );
}

/**
 * Wraps the pay route. Inside an in app browser it shows the handoff card before any
 * sign in or claim runs, so the intent stays unclaimed until the fan reaches Safari or
 * Chrome. Elsewhere it renders the route.
 */
export function InAppBrowserGate({
  link,
  children,
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
}: {
  link: string;
  children: ReactNode;
  userAgent?: string;
}) {
  const [browser] = useState(() => detectInAppBrowser(userAgent));
  useEffect(() => {
    if (browser) trackGAEvent("handoff_shown", "checkout", browser.app);
  }, [browser]);
  if (!browser) return <>{children}</>;
  return <HandoffCard browser={browser} link={link} />;
}

/**
 * /pay/{intent} behind the gate. The link is the pay URL with the intent only: any query
 * the page was opened with (mock outcomes, tracking) is dropped.
 */
export function PayHandoffGate({ children }: { children: ReactNode }) {
  const { intentId = "" } = useParams();
  if (!isFeatureOn("checkout")) return <>{children}</>;
  const path = checkoutIntentIdSchema.safeParse(intentId).success ? checkoutPayPath(intentId) : "/";
  return <InAppBrowserGate link={`${window.location.origin}${path}`}>{children}</InAppBrowserGate>;
}

/** MB-2: the join sheet gets the same in app browser handoff as the pay sheet. */
export function JoinHandoffGate({ children }: { children: ReactNode }) {
  const { handle = "" } = useParams();
  if (!isFeatureOn("checkout")) return <>{children}</>;
  const clean = handle.replace(/^@/, "").toLowerCase();
  const path = /^[a-z0-9_.-]{1,64}$/.test(clean) ? `/join/@${clean}` : "/";
  return <InAppBrowserGate link={`${window.location.origin}${path}`}>{children}</InAppBrowserGate>;
}

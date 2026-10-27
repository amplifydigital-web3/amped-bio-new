import { useEffect, useRef, useState } from "react";
import { AlertCircle, LifeBuoy, RotateCcw } from "lucide-react";
import { Button } from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { useSupportWidget } from "./useSupportWidget";
import { ShellSkeleton } from "./ShellSkeleton";

/** How long the shell waits for auth and the profile before it says so (081 I08). */
export const SHELL_TIMEOUT_MS = 10_000;

/**
 * The public sign in with a return address (081 I05). The sign in page sends
 * the person back to this exact app URL after success; it accepts only the
 * app and admin origins.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function signInUrl(returnTo: string = window.location.href) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Panels that show the live preview frame beside the content (D10). */
// eslint-disable-next-line react-refresh/only-export-components
export const PREVIEW_PATHS = ["/page", "/design"];

/**
 * 081 I01, I08, I12. The room paints at once; after 400ms still pending, the
 * shell skeleton for the target destination. After 10 s still pending, the
 * timeout card. `onRetry` restarts whatever the caller is waiting on.
 */
export function ShellPending({ onRetry }: { onRetry: () => void }) {
  const showSkeleton = useDelayed(true, 400);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), SHELL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [attempt]);

  // 081 I03: the tab title while loading
  useEffect(() => {
    document.title = "Amped.Bio";
  }, []);

  if (timedOut) {
    return (
      <ShellErrorCard
        title="We did not confirm your sign in"
        cause="The server took too long to respond."
        onRetry={() => {
          setTimedOut(false);
          setAttempt(current => current + 1);
          onRetry();
        }}
      />
    );
  }

  if (!showSkeleton) return <div className="prism-room min-h-dvh" />;
  const preview = PREVIEW_PATHS.some(path => window.location.pathname.startsWith(path));
  return <ShellSkeleton preview={preview} />;
}

/**
 * 081 I07, I08. One G1 clear card, r21, padding 34, 508 wide, centered on the
 * room: danger icon, title, one line cause, Retry, Contact support (D15), and
 * the note that nothing changed. Focus moves to the title.
 */
export function ShellErrorCard({
  title,
  cause,
  onRetry,
}: {
  title: string;
  cause: string;
  onRetry: () => void;
}) {
  const { openContactForm } = useSupportWidget();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="prism-room prism-font flex min-h-dvh items-center justify-center px-[13px] text-prism-ink">
      <section
        role="alert"
        className="prism-glass-clear w-full max-w-[508px] !rounded-prism-21 p-[21px] font-prism sm:p-[34px]"
      >
        <AlertCircle aria-hidden className="h-[21px] w-[21px] text-prism-danger" />
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="mt-[13px] text-prism-panel-title text-prism-ink outline-none"
        >
          {title}
        </h1>
        <p className="mt-2 text-prism-body text-prism-ink-2">{cause}</p>
        <div className="mt-[21px] flex flex-col gap-[13px] sm:flex-row sm:items-center sm:gap-[21px]">
          <Button type="button" size="lg" onClick={onRetry} className="max-sm:w-full">
            <RotateCcw aria-hidden />
            Retry
          </Button>
          <Button type="button" variant="ghost" onClick={openContactForm} className="max-sm:w-full">
            <LifeBuoy aria-hidden />
            Contact support
          </Button>
        </div>
        <p className="mt-[21px] border-t border-prism-line pt-[13px] text-prism-meta text-prism-ink-2">
          Nothing was changed. Editing and autosave start once your page loads.
        </p>
      </section>
    </div>
  );
}

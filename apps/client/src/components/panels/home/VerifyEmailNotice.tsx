import { useState } from "react";
import { Info, X } from "lucide-react";
import { Button } from "@repo/ui";
import { useResendVerification } from "@/hooks/useResendVerification";

const DISMISS_KEY = "amped:verify-email-notice-hidden";

function readHidden() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** "9 Nov" style date for the verification deadline */
function shortDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Verify email reminder on Home (Screen Review 015 I11): informational notice
// while the email is unverified, Resend email with the 60 second cooldown of
// row 012, and a 44 dismiss that hides it for this session. The copy does not
// claim a link was just sent (QA-035, wording approved by Rob 6 Oct). The
// verification grace (Rob, 10 Oct) adds the date by which the email must be
// verified to keep follows counted and broadcasts sending.
export function VerifyEmailNotice({
  email,
  verifyBy,
}: {
  email: string;
  verifyBy?: string | null;
}) {
  const [hidden, setHidden] = useState(readHidden);
  // The same resend as the Account email row (QA-058)
  const { resend, sending, disabled, label } = useResendVerification(email);

  const deadline = verifyBy ? shortDate(verifyBy) : null;
  const expired = !!verifyBy && new Date(verifyBy).getTime() <= Date.now();

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Hidden until the page reloads
    }
  };

  return (
    <div
      role="note"
      className="prism-glass-clear flex items-start gap-3 rounded-prism-13 py-2 pl-[21px] pr-2 font-prism sm:items-center"
    >
      <Info className="mt-[12px] h-[21px] w-[21px] shrink-0 text-prism-nav sm:mt-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-x-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 py-[10px] text-prism-body text-prism-ink sm:py-0">
          Your email is not verified yet. Resend the link.
          {deadline &&
            (expired
              ? " Verify it to count your follows and send broadcasts."
              : ` Verify by ${deadline} to keep your follows and broadcasts.`)}
        </p>
        <Button
          variant="ghost"
          className="self-start tabular-nums sm:self-auto"
          disabled={disabled}
          aria-busy={sending || undefined}
          onClick={() => void resend()}
        >
          {label("Resend email")}
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2"
      >
        <X className="h-[21px] w-[21px]" aria-hidden />
      </button>
    </div>
  );
}

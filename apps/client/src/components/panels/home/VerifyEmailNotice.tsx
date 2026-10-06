import { useState } from "react";
import { Info, X } from "lucide-react";
import { Button, authClient, useCooldown } from "@repo/ui";
import { toast } from "@/components/ui/toast";

const DISMISS_KEY = "amped:verify-email-notice-hidden";

function readHidden() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// Verify email reminder on Home (Screen Review 015 I11): informational notice
// while the email is unverified, Resend email with the 60 second cooldown of
// row 012, and a 44 dismiss that hides it for this session. The copy does not
// claim a link was just sent (QA-035, wording approved by Rob 6 Oct).
export function VerifyEmailNotice({ email }: { email: string }) {
  const [hidden, setHidden] = useState(readHidden);
  const [sending, setSending] = useState(false);
  const { remaining, start } = useCooldown();

  if (hidden) return null;

  const resend = async () => {
    setSending(true);
    try {
      const response = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${import.meta.env.VITE_LANDINGPAGE_URL}/auth/verify-email`,
      });
      if (response.error) throw response.error;
      start();
      toast.add({ type: "success", title: "Verification email sent" });
    } catch (error) {
      console.error("Verification email failed:", error);
      toast.add({
        type: "error",
        title: "The email did not send",
        description: "Wait a minute, then send again.",
      });
    } finally {
      setSending(false);
    }
  };

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
        </p>
        <Button
          variant="ghost"
          className="self-start tabular-nums sm:self-auto"
          disabled={sending || remaining > 0}
          aria-busy={sending || undefined}
          onClick={() => void resend()}
        >
          {sending ? "Sending" : remaining > 0 ? `Resend in ${remaining}s` : "Resend email"}
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

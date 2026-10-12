import { Loader2, MailWarning } from "lucide-react";
import { Button, useAuth } from "@repo/ui";
import { useResendVerification } from "@/hooks/useResendVerification";

// QA-058: Account Settings shows a resend while the email is not verified,
// above the account card, so the link can be sent again without going back
// to Home. Same request, cooldown and toasts as the Home notice (015 I11).
// Only an explicit false shows it; unknown stays quiet (QA-035).
export function VerifyEmailCard() {
  const { authUser } = useAuth();
  const email = authUser?.email ?? "";
  const unverified = !!email && authUser?.emailVerified === false;
  const { resend, sending, disabled, label } = useResendVerification(email);

  if (!unverified) return null;

  return (
    <div
      role="note"
      className="prism-glass-clear flex flex-col gap-3 rounded-prism-13 p-[21px] font-prism sm:flex-row sm:items-center"
    >
      <MailWarning className="h-[21px] w-[21px] shrink-0 text-prism-warning-ink" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-prism-label font-semibold text-prism-ink">Email not verified</p>
        <p className="text-prism-meta text-prism-ink-2">
          We send a verification link to <span className="break-all">{email}</span>. Open it to
          verify your email.
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="shrink-0 tabular-nums max-sm:w-full"
        disabled={disabled}
        aria-busy={sending || undefined}
        onClick={() => void resend()}
      >
        {sending && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
        {label("Resend verification email")}
      </Button>
    </div>
  );
}

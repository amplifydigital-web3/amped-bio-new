import { useState } from "react";
import { authClient, useCooldown } from "@repo/ui";
import { toast } from "@/components/ui/toast";

/**
 * Resend the email verification link, with the 60 second cooldown of row 012.
 * Shared by the Home notice (015 I11) and the Account email row (QA-058), so
 * both send the same link to the same landing page and show the same toasts.
 */
export function useResendVerification(email: string) {
  const [sending, setSending] = useState(false);
  const { remaining, start } = useCooldown();

  const resend = async () => {
    if (sending || remaining > 0) return;
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

  /** Button text: Sending, the cooldown, or the idle label */
  const label = (idle: string) =>
    sending ? "Sending" : remaining > 0 ? `Resend in ${remaining}s` : idle;

  return { resend, sending, remaining, disabled: sending || remaining > 0, label };
}

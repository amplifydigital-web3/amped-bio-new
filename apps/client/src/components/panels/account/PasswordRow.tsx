import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, authClient, useAuth } from "@repo/ui";
import { useCaptcha } from "@/hooks/useCaptcha";
import { formatClock, useSecondsLeft } from "@/hooks/useSecondsLeft";
import { DisclosureRow } from "../design/kit/DisclosureRow";
import { FieldError } from "../page/blocks/LinkFields";

// Screen Review 021 I01, I02. Password, row three of the Account card. There
// is no in account password change, so the row sends the reset email the
// sign in page sends. The captcha is Cap proof of work (021 delta).

export const PASSWORD_ROW = "password";

const COOLDOWN_MS = 60_000;

/**
 * The reset page lives on the public site, not in the editor. The shared
 * resetPassword in @repo/ui points the link at window.location.origin, which
 * is the editor here, so this row names the public site origin itself.
 */
function resetRedirect(email: string) {
  const base = import.meta.env.VITE_LANDINGPAGE_URL ?? window.location.origin;
  return `${base}/auth/reset-password?email=${encodeURIComponent(email)}`;
}

function PasswordReset() {
  const { authUser } = useAuth();
  const { executeCaptcha } = useCaptcha();
  const email = authUser?.email ?? "";
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const cooldown = useSecondsLeft(cooldownUntil);

  const send = async () => {
    if (!email || sending || cooldown > 0) return;
    setSending(true);
    setFailed(false);
    try {
      const token = await executeCaptcha();
      const response = await authClient.requestPasswordReset({
        email,
        redirectTo: resetRedirect(email),
        fetchOptions: token ? { headers: { "x-captcha-response": token } } : undefined,
      });
      if (response.error) throw response.error;
      setSentTo(email);
      setCooldownUntil(new Date(Date.now() + COOLDOWN_MS));
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-[13px]">
      <p role="status" className="text-prism-meta text-prism-ink-2">
        {sentTo ? (
          <>
            Check <span className="[overflow-wrap:anywhere]">{sentTo}</span> for a reset link.
          </>
        ) : (
          "We email you a link to set a new password."
        )}
      </p>
      {failed && (
        <FieldError id="password-reset-error">
          The reset link did not send. Check your connection and try again.
        </FieldError>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={() => void send()}
        disabled={sending || cooldown > 0 || !email}
        aria-busy={sending}
        className="tabular-nums max-sm:w-full"
      >
        {sending && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
        {sending
          ? "Sending"
          : cooldown > 0
            ? `Send again in ${formatClock(cooldown)}`
            : "Send reset link"}
      </Button>
    </div>
  );
}

export function PasswordRow() {
  return (
    <DisclosureRow id={PASSWORD_ROW} label="Password" value="Reset by email">
      <PasswordReset />
    </DisclosureRow>
  );
}

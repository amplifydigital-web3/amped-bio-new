"use client";

import { useEffect, useState } from "react";
import { OAuthLoginScreen, OAuthShell, useOAuthClientName } from "@repo/ui";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";
import { useCaptcha } from "@/hooks/useCaptcha";
import { getPanelHomeUrl } from "@/lib/panel";

// Sign in with Amped.Bio for third party apps (Screen Review 009 I19, I20):
// the shared auth card under the public header. Forgot password and Create
// account carry the authorize URL back as returnTo.
export default function OAuthLoginForm() {
  const { executeCaptcha, isCaptchaEnabled } = useCaptcha();
  const clientName = useOAuthClientName();
  const [returnTo, setReturnTo] = useState("");
  // Read after mount so the server and first client render match
  useEffect(() => setReturnTo(encodeURIComponent(window.location.href)), []);

  return (
    <OAuthShell
      header={<PublicHeader />}
      title="Sign in with Amped.Bio"
      subtitle={
        clientName
          ? `Continue to ${clientName} with your Amped.Bio account.`
          : "Continue to the app that sent you here with your Amped.Bio account."
      }
    >
      <OAuthLoginScreen
        googleEnabled={Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)}
        getCaptchaToken={executeCaptcha}
        captchaRequired={isCaptchaEnabled}
        privacyHref={PRIVACY_POLICY_URL}
        forgotPasswordHref={email =>
          `/auth/reset-password?${email ? `email=${encodeURIComponent(email)}&` : ""}returnTo=${returnTo}`
        }
        createAccountHref={`/register?returnTo=${returnTo}`}
        onSignedIn={() => {
          window.location.href = getPanelHomeUrl();
        }}
      />
    </OAuthShell>
  );
}

import type { Metadata } from "next";
import { OAuthConsentScreen, OAuthShell } from "@repo/ui";

export const metadata: Metadata = {
  title: "Authorize application | Amped.bio",
  description: "Review the permissions an application is requesting on your Amped.bio account.",
  robots: { index: false, follow: false },
};

export default function OAuthConsentPage() {
  return (
    <OAuthShell
      title="Authorize access"
      subtitle="Review what this application will be able to do with your account."
      footer="You stay in control: access can be revoked at any time."
    >
      <OAuthConsentScreen />
    </OAuthShell>
  );
}

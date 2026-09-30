import type { Metadata } from "next";
import Link from "next/link";
import { OAuthShell } from "@repo/ui";
import OAuthLoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in with Amped.bio",
  description: "Use your Amped.bio account to authorize an application.",
  robots: { index: false, follow: false },
};

export default function OAuthLoginPage() {
  return (
    <OAuthShell
      title="Sign in with Amped.bio"
      subtitle="Use your Amped.bio account to authorize this application."
      footer={
        <>
          By continuing you agree to our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <OAuthLoginForm />
    </OAuthShell>
  );
}

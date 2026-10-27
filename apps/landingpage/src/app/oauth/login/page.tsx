import type { Metadata } from "next";
import OAuthLoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in with Amped.Bio",
  description: "Use your Amped.Bio account to authorize an application.",
  robots: { index: false, follow: false },
};

export default function OAuthLoginPage() {
  return <OAuthLoginForm />;
}

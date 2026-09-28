"use client";

import { useRouter } from "next/navigation";
import { OAuthLoginScreen } from "@repo/ui";
import { useCaptcha } from "@/hooks/useCaptcha";

export default function OAuthLoginForm() {
  const router = useRouter();
  const { executeCaptcha } = useCaptcha();

  return (
    <OAuthLoginScreen
      googleEnabled={Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)}
      getCaptchaToken={executeCaptcha}
      onSignedIn={() => router.replace("/")}
    />
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { AuthCard, AuthLegalLine, Button, StatusDisc, useCooldown } from "@repo/ui";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";

// Shared by resend verification (012) and the reset password request (013 I03)
export function SentState({
  email,
  body,
  onResend,
  onUseDifferentEmail,
}: {
  email: string;
  body: (email: ReactNode) => ReactNode;
  onResend: () => Promise<boolean>;
  onUseDifferentEmail: () => void;
}) {
  const { remaining, start } = useCooldown();
  const [resending, setResending] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    start();
    titleRef.current?.focus();
  }, [start]);

  const resend = async () => {
    setResending(true);
    const ok = await onResend();
    setResending(false);
    if (ok) start();
  };

  return (
    <AuthCard
      centered
      status
      titleRef={titleRef}
      icon={<StatusDisc icon={Mail} tone="nav" />}
      title="Check your inbox"
      subtitle={body(<b className="font-semibold text-prism-ink">{email}</b>)}
      footer={<AuthLegalLine privacyHref={PRIVACY_POLICY_URL} />}
    >
      <div className="flex flex-col items-center gap-[13px] pt-[13px]">
        <Button
          variant="secondary"
          className="w-full tabular-nums sm:w-auto"
          disabled={remaining > 0 || resending}
          aria-busy={resending || undefined}
          onClick={() => void resend()}
        >
          {resending ? "Sending" : remaining > 0 ? `Resend in ${remaining}s` : "Resend link"}
        </Button>
        <Button variant="ghost" onClick={onUseDifferentEmail}>
          Use a different email
        </Button>
      </div>
    </AuthCard>
  );
}

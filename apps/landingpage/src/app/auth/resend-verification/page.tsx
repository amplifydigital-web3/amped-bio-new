"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import {
  AuthCard,
  AuthCardSkeleton,
  AuthLegalLine,
  Button,
  Input,
  Notice,
  SUPPORT_TICKET_URL,
} from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SentState } from "@/components/auth/SentState";
import { EMAIL_FIX } from "@/components/auth/SignInForm";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";
import { useDelayed } from "@/hooks/useDelayed";

const emailSchema = z.string().email();
const SEND_FAILED_PARAMS = ["emailSendFailed", "tokenGenerationFailed", "serverError"];

// Resend verification (Screen Review 012): the field is prefilled from ?email
// and nothing is sent until the button press. The Sent state reads the same
// whether or not an account uses the address.
function ResendVerification() {
  const params = useSearchParams();
  const errorParam = params.get("error");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [emailError, setEmailError] = useState<string>();
  const [sendFailed, setSendFailed] = useState(
    !!errorParam && SEND_FAILED_PARAMS.includes(errorParam)
  );
  const [sentTo, setSentTo] = useState<string | null>(
    params.get("status") === "success" || errorParam === "userNotFound"
      ? (params.get("email") ?? "")
      : null
  );
  const [sending, setSending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorParam === "emailMissing") {
      setEmailError("Enter your email.");
      emailRef.current?.focus();
    }
  }, [errorParam]);

  useEffect(() => {
    if (sendFailed) noticeRef.current?.focus();
  }, [sendFailed]);

  const validate = (value: string) => {
    if (!value) return "Enter your email.";
    return emailSchema.safeParse(value).success ? undefined : EMAIL_FIX;
  };

  // True when the request went through (or would reveal nothing either way)
  const send = async (address: string): Promise<boolean> => {
    setSendFailed(false);
    try {
      const response = await authClient.sendVerificationEmail({
        email: address,
        callbackURL: `${window.location.origin}/auth/verify-email`,
      });
      if (response.error) {
        // Already verified or a different signed in account: same neutral Sent state
        if (/ALREADY_VERIFIED|MISMATCH|NOT_FOUND/i.test(response.error.code ?? "")) return true;
        console.error("Verification email failed:", response.error);
        setSendFailed(true);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Verification email failed:", error);
      setSendFailed(true);
      return false;
    }
  };

  const submit = async () => {
    const nextError = validate(email);
    setEmailError(nextError);
    if (nextError) return emailRef.current?.focus();
    setSending(true);
    const ok = await send(email);
    setSending(false);
    if (ok) setSentTo(email);
  };

  if (sentTo !== null) {
    return (
      <SentState
        email={sentTo}
        body={address => (
          <>
            If an account uses {address}, a verification link is on its way. It works for one hour.
          </>
        )}
        onResend={() => send(sentTo)}
        onUseDifferentEmail={() => {
          setSentTo(null);
          setTimeout(() => emailRef.current?.focus());
        }}
      />
    );
  }

  return (
    <AuthCard
      title="Verify your email"
      subtitle="Enter the email you signed up with and we will send a new link."
      notice={
        sendFailed ? (
          <Notice
            ref={noticeRef}
            tabIndex={-1}
            role="alert"
            variant="warning"
            className="outline-none"
            title="The email did not send"
          >
            <p>Wait a minute, then send again. If it keeps failing, contact support.</p>
            <Button variant="ghost" className="mt-2" asChild>
              <a href={SUPPORT_TICKET_URL} target="_blank" rel="noopener noreferrer">
                Contact support
              </a>
            </Button>
          </Notice>
        ) : undefined
      }
      footer={<AuthLegalLine privacyHref={PRIVACY_POLICY_URL} />}
    >
      <form
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          ref={emailRef}
          id="resend-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          error={emailError}
          onChange={event => setEmail(event.target.value)}
          onBlur={() => email && setEmailError(validate(email))}
        />
        <div className="space-y-[21px] pt-[34px]">
          <Button type="submit" size="lg" className="w-full" disabled={sending} aria-busy={sending}>
            {sending && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {sending ? "Sending" : "Send verification email"}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}

function CardFallback() {
  const show = useDelayed(true, 400);
  return show ? <AuthCardSkeleton /> : null;
}

export default function ResendVerificationPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<CardFallback />}>
        <ResendVerification />
      </Suspense>
    </AuthLayout>
  );
}

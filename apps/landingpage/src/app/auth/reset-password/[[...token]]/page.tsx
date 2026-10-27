"use client";

import { Suspense, use, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { z } from "zod";
import {
  AuthCard,
  AuthCardSkeleton,
  AuthLegalLine,
  Button,
  CAPTCHA_FAILED,
  InlineError,
  Input,
  Notice,
  PasswordInput,
  StatusDisc,
  classifyAuthError,
  cn,
} from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { useCaptcha } from "@/hooks/useCaptcha";
import { useDelayed } from "@/hooks/useDelayed";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SentState } from "@/components/auth/SentState";
import { EMAIL_FIX } from "@/components/auth/SignInForm";
import { PasswordChecklist, passwordMeetsRules } from "@/components/auth/PasswordChecklist";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";
import { getSafeRedirect } from "@/lib/panel";

const emailSchema = z.string().email();
const legal = <AuthLegalLine privacyHref={PRIVACY_POLICY_URL} />;

// Query string carried between the steps: the email and a safe returnTo
function carry(params: URLSearchParams, email: string) {
  const next = new URLSearchParams();
  if (email) next.set("email", email);
  const returnTo = getSafeRedirect(params.get("returnTo"));
  if (returnTo) next.set("returnTo", returnTo);
  const query = next.toString();
  return query ? `?${query}` : "";
}

/* -------------------------------------------------------------------------- */
/* Request step (013 I02 to I04)                                               */
/* -------------------------------------------------------------------------- */

function RequestStep() {
  const params = useSearchParams();
  const router = useRouter();
  const { executeCaptcha, isCaptchaEnabled } = useCaptcha();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [emailError, setEmailError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<"captcha" | "network" | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failure === "network") noticeRef.current?.focus();
  }, [failure]);

  const validate = (value: string) => {
    if (!value) return "Enter your email.";
    return emailSchema.safeParse(value).success ? undefined : EMAIL_FIX;
  };

  // True once the request went through. The copy never says whether an account exists.
  const request = async (address: string): Promise<boolean> => {
    setFailure(null);
    try {
      const token = await executeCaptcha();
      if (isCaptchaEnabled && !token) {
        setFailure("captcha");
        return false;
      }
      const response = await authClient.requestPasswordReset({
        email: address,
        redirectTo: `${window.location.origin}/auth/reset-password`,
        fetchOptions: { headers: token ? { "x-captcha-response": token } : undefined },
      });
      if (response.error) {
        console.error("Password reset request failed:", response.error);
        setFailure(classifyAuthError(response.error) === "captcha" ? "captcha" : "network");
        return false;
      }
      return true;
    } catch (error) {
      console.error("Password reset request failed:", error);
      setFailure("network");
      return false;
    }
  };

  const submit = async () => {
    const nextError = validate(email);
    setEmailError(nextError);
    if (nextError) return emailRef.current?.focus();
    setSending(true);
    const ok = await request(email);
    setSending(false);
    if (ok) setSentTo(email);
  };

  const continueWithCode = () => {
    const value = code.trim();
    if (!value) {
      setCodeError("Enter the code from your email.");
      return codeRef.current?.focus();
    }
    router.push(`/auth/reset-password/${encodeURIComponent(value)}${carry(params, email)}`);
  };

  if (sentTo !== null) {
    return (
      <SentState
        email={sentTo}
        body={address => <>If an account uses {address}, a reset link is on its way.</>}
        onResend={() => request(sentTo)}
        onUseDifferentEmail={() => {
          setSentTo(null);
          setTimeout(() => emailRef.current?.focus());
        }}
      />
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account email and we will send a reset link."
      notice={
        failure === "network" ? (
          <Notice
            ref={noticeRef}
            tabIndex={-1}
            role="alert"
            variant="warning"
            className="outline-none"
            title="The reset link did not send"
          >
            <p>Check your connection and try again.</p>
            <Button variant="ghost" className="mt-2" onClick={() => void submit()}>
              Retry
            </Button>
          </Notice>
        ) : undefined
      }
      footer={legal}
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
          id="reset-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          error={emailError}
          onChange={event => setEmail(event.target.value)}
          onBlur={() => email && setEmailError(validate(email))}
        />
        <div className="space-y-3 pt-[34px]">
          <Button type="submit" size="lg" className="w-full" disabled={sending} aria-busy={sending}>
            {sending && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {sending ? "Sending" : "Send reset link"}
          </Button>
          {failure === "captcha" && (
            <InlineError
              action={
                <Button variant="ghost" size="sm" onClick={() => void submit()}>
                  Try again
                </Button>
              }
            >
              {CAPTCHA_FAILED}
            </InlineError>
          )}
        </div>
        <div className="pt-[21px]">
          <Button variant="ghost" asChild>
            <Link href={`/login${carry(params, email)}`}>Back to sign in</Link>
          </Button>
        </div>
      </form>

      {/* Manual token entry behind a disclosure (013 I04) */}
      <div className="mt-[21px] border-t border-prism-line">
        <button
          type="button"
          aria-expanded={codeOpen}
          aria-controls="reset-code-region"
          onClick={() => {
            setCodeOpen(open => !open);
            if (!codeOpen) setTimeout(() => codeRef.current?.focus());
          }}
          className="prism-focus flex h-commit w-full items-center justify-between rounded-prism-13 text-left text-prism-label font-semibold text-prism-ink"
        >
          Have a reset code?
          <ChevronDown
            aria-hidden
            className={cn(
              "h-[21px] w-[21px] text-prism-ink-2 transition-transform duration-prism-control motion-reduce:transition-none",
              codeOpen && "rotate-180"
            )}
          />
        </button>
        {codeOpen && (
          <div id="reset-code-region" className="space-y-[13px] pb-2">
            <Input
              ref={codeRef}
              id="reset-code"
              label="Reset code"
              autoComplete="off"
              value={code}
              error={codeError}
              onChange={event => {
                setCode(event.target.value);
                if (codeError) setCodeError(undefined);
              }}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  continueWithCode();
                }
              }}
            />
            <Button variant="secondary" onClick={continueWithCode}>
              Continue
            </Button>
          </div>
        )}
      </div>
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/* New password step (013 I05 to I10)                                          */
/* -------------------------------------------------------------------------- */

function NewPasswordStep({ token }: { token: string }) {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"expired" | "done" | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) titleRef.current?.focus();
  }, [result]);
  useEffect(() => {
    if (networkError) noticeRef.current?.focus();
  }, [networkError]);

  const passwordOk = passwordMeetsRules(password);
  const matches = confirm.length > 0 && confirm === password;
  const showChecklist = passwordFocused || (!!password && !passwordOk) || !!passwordError;

  const submit = async () => {
    setNetworkError(false);
    setConfirmTouched(true);
    if (!passwordOk) {
      setPasswordError("Meet each rule below.");
      return passwordRef.current?.focus();
    }
    if (!matches) return confirmRef.current?.focus();
    setSubmitting(true);
    try {
      const response = await authClient.resetPassword({ newPassword: password, token });
      if (response.error) {
        console.error("Password reset failed:", response.error);
        if (
          /INVALID_TOKEN|expired|invalid/i.test(`${response.error.code} ${response.error.message}`)
        )
          setResult("expired");
        else setNetworkError(true);
        return;
      }
      setResult("done");
    } catch (error) {
      console.error("Password reset failed:", error);
      setNetworkError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (result === "expired") {
    return (
      <AuthCard
        centered
        status
        titleRef={titleRef}
        icon={<StatusDisc icon={AlertCircle} tone="danger" />}
        title="This reset link has expired"
        subtitle="Reset links work for a limited time. Send a new one."
        footer={legal}
      >
        <div className="pt-[13px]">
          <Button size="lg" className="w-full" asChild>
            <Link href={`/auth/reset-password${carry(params, email)}`}>Send a new link</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (result === "done") {
    return (
      <AuthCard
        centered
        status
        titleRef={titleRef}
        icon={<StatusDisc icon={Check} tone="success" />}
        title="Password updated"
        subtitle="Sign in with your new password."
        footer={legal}
      >
        <div className="pt-[13px]">
          <Button size="lg" className="w-full" asChild>
            <Link href={`/login${carry(params, email)}`}>Sign in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const confirmLine =
    confirmTouched && confirm.length > 0 ? (
      matches ? (
        <p
          id="reset-confirm-status"
          className="flex items-center gap-1.5 font-prism text-prism-meta text-prism-success"
        >
          <Check className="h-[21px] w-[21px] shrink-0" aria-hidden />
          Passwords match
        </p>
      ) : (
        <p
          id="reset-confirm-status"
          className="flex items-center gap-1.5 font-prism text-prism-meta text-prism-danger"
        >
          <AlertCircle className="h-[21px] w-[21px] shrink-0" aria-hidden />
          Passwords do not match yet
        </p>
      )
    ) : null;

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Use it to sign in from now on."
      notice={
        networkError ? (
          <Notice
            ref={noticeRef}
            tabIndex={-1}
            role="alert"
            variant="warning"
            className="outline-none"
            title="Your password did not change"
          >
            <p>Check your connection and try again.</p>
            <Button variant="ghost" className="mt-2" onClick={() => void submit()}>
              Retry
            </Button>
          </Notice>
        ) : undefined
      }
      footer={legal}
    >
      <form
        noValidate
        className="space-y-[21px]"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void submit();
        }}
      >
        {/* The account email lets password managers save the new password */}
        {email && (
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
        )}
        <div className="space-y-2">
          <PasswordInput
            ref={passwordRef}
            id="reset-password"
            label="New password"
            autoComplete="new-password"
            value={password}
            error={passwordError}
            visible={visible}
            onVisibleChange={setVisible}
            toggleControls="reset-password reset-confirm"
            aria-describedby="reset-password-rules"
            onChange={event => {
              setPassword(event.target.value);
              if (passwordError && passwordMeetsRules(event.target.value))
                setPasswordError(undefined);
            }}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
          <PasswordChecklist
            id="reset-password-rules"
            password={password}
            visible={showChecklist}
          />
        </div>
        <div className="space-y-2">
          <Input
            ref={confirmRef}
            id="reset-confirm"
            label="Confirm password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            aria-describedby={confirmLine ? "reset-confirm-status" : undefined}
            onChange={event => setConfirm(event.target.value)}
            onBlur={() => setConfirmTouched(true)}
          />
          <div aria-live="polite">{confirmLine}</div>
        </div>
        <div className="pt-[13px]">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {submitting ? "Saving" : "Set new password"}
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

// Reset password (Screen Review 013): one route, two steps. No token is the
// request step; a token in the path is the new password step, carried in
// state and never shown as a field.
export default function PasswordResetPage({ params }: { params: Promise<{ token?: string[] }> }) {
  const { token: tokenArray } = use(params);
  const token = (tokenArray || []).join("/");

  return (
    <AuthLayout>
      <Suspense fallback={<CardFallback />}>
        {token ? <NewPasswordStep token={decodeURIComponent(token)} /> : <RequestStep />}
      </Suspense>
    </AuthLayout>
  );
}

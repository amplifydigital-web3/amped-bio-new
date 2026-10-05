"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import {
  AuthCard,
  AuthLegalLine,
  AuthSwitchLine,
  Button,
  CAPTCHA_FAILED,
  GOOGLE_FAILED_BODY,
  GOOGLE_FAILED_TITLE,
  GoogleSignInButton,
  InlineError,
  Input,
  Notice,
  OrDivider,
  PasswordInput,
  SUPPORT_TICKET_URL,
  classifyAuthError,
  startGoogleSignIn,
} from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { useCaptcha } from "@/hooks/useCaptcha";
import { useReferralHandler } from "@/hooks/useReferralHandler";
import { getPostAuthDestination, goTo, toAbsoluteUrl } from "@/lib/panel";
import { trackGAEvent } from "@/utils/ga";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";

const emailSchema = z.string().email();
export const EMAIL_FIX = "Enter an email like name@example.com.";
const CREDENTIALS_ERROR = "Email or password is incorrect.";
const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

type CardError = "blocked" | "network" | "google" | null;

// Sign in (Screen Review 009): the shared auth card inline on the room. Email
// and password wells with labels above, Forgot password on the label row, one
// 55 primary, or divider, Continue with Google, Create account, legal line.
export function SignInForm() {
  const params = useSearchParams();
  const { executeCaptcha, isCaptchaEnabled } = useCaptcha();
  const { getReferrerId } = useReferralHandler();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [cardError, setCardError] = useState<CardError>(
    params.get("error") === "google" ? "google" : null
  );
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const destination = getPostAuthDestination(params);

  // Email autofocus on desktop only (009 I05)
  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cardError) noticeRef.current?.focus();
  }, [cardError]);

  const validateEmail = (value: string) =>
    emailSchema.safeParse(value).success ? undefined : EMAIL_FIX;

  const submit = async () => {
    setCardError(null);
    setCaptchaFailed(false);
    const nextEmailError = validateEmail(email);
    const nextPasswordError = password ? undefined : "Enter your password.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError) return emailRef.current?.focus();
    if (nextPasswordError) return passwordRef.current?.focus();

    setLoading(true);
    try {
      const token = await executeCaptcha();
      if (isCaptchaEnabled && !token) {
        setCaptchaFailed(true);
        return;
      }
      const response = await authClient.signIn.email({
        email,
        password,
        rememberMe: true,
        fetchOptions: { headers: token ? { "x-captcha-response": token } : undefined },
      });
      if (response?.error) {
        const kind = classifyAuthError(response.error);
        if (kind === "credentials") {
          setPasswordError(CREDENTIALS_ERROR);
          passwordRef.current?.focus();
        } else if (kind === "captcha") setCaptchaFailed(true);
        else if (kind === "blocked") setCardError("blocked");
        else setCardError("network");
        return;
      }
      // Two factor accounts are sent to /auth/two-factor by the client plugin
      if ((response?.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return;
      goTo(destination);
    } catch {
      setCardError("network");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    trackGAEvent("Click", "AuthCard", "GoogleSignIn");
    setCardError(null);
    setGoogleLoading(true);
    const failure = await startGoogleSignIn({
      callbackURL: toAbsoluteUrl(destination),
      newUserCallbackURL: toAbsoluteUrl(getPostAuthDestination(params, { welcome: true })),
      errorCallbackURL: toAbsoluteUrl("/login?error=google"),
      referrerId: getReferrerId(),
    });
    if (failure) {
      setGoogleLoading(false);
      setCardError("google");
    }
  };

  const busy = loading || googleLoading;
  const resetHref = `/auth/reset-password${email ? `?email=${encodeURIComponent(email)}` : ""}`;

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back. Your editor is one step away."
      notice={
        cardError && (
          <Notice
            ref={noticeRef}
            tabIndex={-1}
            role="alert"
            variant="warning"
            className="outline-none"
            title={
              cardError === "blocked"
                ? "Account blocked"
                : cardError === "google"
                  ? GOOGLE_FAILED_TITLE
                  : "You are not signed in"
            }
          >
            <p>
              {cardError === "blocked"
                ? "Contact support to learn more."
                : cardError === "google"
                  ? GOOGLE_FAILED_BODY
                  : "Check your connection and try again."}
            </p>
            {cardError === "blocked" ? (
              <Button variant="ghost" className="mt-2" asChild>
                <a href={SUPPORT_TICKET_URL} target="_blank" rel="noopener noreferrer">
                  Contact support
                </a>
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => void (cardError === "google" ? google() : submit())}
              >
                Retry
              </Button>
            )}
          </Notice>
        )
      }
      footer={
        <>
          <AuthSwitchLine
            text="New to Amped.Bio?"
            action={
              <Button variant="ghost" asChild data-testid="switch-to-register">
                <Link href={`/register${email ? `?email=${encodeURIComponent(email)}` : ""}`}>
                  Create account
                </Link>
              </Button>
            }
          />
          <AuthLegalLine privacyHref={PRIVACY_POLICY_URL} />
        </>
      }
    >
      <form
        noValidate
        data-testid="login-form"
        className="space-y-[21px]"
        onSubmit={event => {
          event.preventDefault();
          trackGAEvent("Click", "AuthCard", "SignInButton");
          void submit();
        }}
      >
        <Input
          ref={emailRef}
          id="login-email"
          data-testid="login-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          error={emailError}
          onChange={event => setEmail(event.target.value)}
          onBlur={() => email && setEmailError(validateEmail(email))}
        />
        <PasswordInput
          ref={passwordRef}
          id="login-password"
          data-testid="login-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          error={passwordError}
          onChange={event => setPassword(event.target.value)}
          labelAction={
            <Link
              href={resetHref}
              data-testid="forgot-password"
              className="prism-focus -my-3 inline-flex h-touch items-center rounded-prism-8 px-1 text-prism-meta font-semibold text-prism-nav"
            >
              Forgot password
            </Link>
          }
          errorAction={
            passwordError === CREDENTIALS_ERROR ? (
              <Button variant="ghost" size="sm" className="-my-3" asChild>
                <Link href={resetHref}>Reset password</Link>
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-3 pt-[13px]">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy}
            aria-busy={loading || undefined}
            data-testid="login-submit"
          >
            {loading && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {loading ? "Signing in" : "Sign in"}
          </Button>
          {captchaFailed && (
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
      </form>
      {googleEnabled && (
        <>
          <OrDivider />
          <GoogleSignInButton
            loading={googleLoading}
            disabled={loading}
            onClick={() => void google()}
          />
        </>
      )}
    </AuthCard>
  );
}

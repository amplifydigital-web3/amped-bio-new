"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Circle, CircleCheck, LoaderCircle } from "lucide-react";
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
  TESTNET_NOTICE,
  classifyAuthError,
  cn,
  startGoogleSignIn,
} from "@repo/ui";
import { HANDLE_MIN_LENGTH } from "@repo/constants";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { cleanHandleInput } from "@/lib/handle";
import { useCaptcha } from "@/hooks/useCaptcha";
import { useReferralHandler } from "@/hooks/useReferralHandler";
import { useHandleAvailability } from "@/hooks/useHandleAvailability";
import { getPostAuthDestination, goTo, toAbsoluteUrl } from "@/lib/panel";
import { trackGAEvent } from "@/utils/ga";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";
import { HandleStatusLine } from "./HandleStatusLine";
import { EMAIL_FIX } from "./SignInForm";

const emailSchema = z.string().email();
const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

const PASSWORD_RULES = [
  { label: "8 or more characters", test: (value: string) => value.length >= 8 },
  { label: "An uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "A lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "A number", test: (value: string) => /[0-9]/.test(value) },
];

const EMAIL_TAKEN = "This email already has an account.";

type CardError = "network" | "google" | null;

// Register (Screen Review 008): the auth card with the handle as the hero
// field. Handle, Email, Password with a live checklist, Create account (always
// enabled; errors point at the field), or divider, Continue with Google, the
// Sign in line and the legal line. An invite shows the solid notice on top.
export function RegisterForm() {
  const params = useSearchParams();
  const { executeCaptcha, isCaptchaEnabled } = useCaptcha();
  const { getReferrerId, clearReferrerId } = useReferralHandler();
  const [handle, setHandle] = useState(cleanHandleInput(params.get("handle") ?? ""));
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [handleError, setHandleError] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [cardError, setCardError] = useState<CardError>(
    params.get("error") === "google" ? "google" : null
  );
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { urlStatus, recheck } = useHandleAvailability(handle);
  const handleRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const referrerId = getReferrerId();
  const { data: referrer } = useQuery({
    ...trpc.referral.getReferrerInfo.queryOptions({ userId: referrerId! }),
    enabled: !!referrerId,
    retry: false,
  });

  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) handleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cardError) noticeRef.current?.focus();
  }, [cardError]);

  const passwordOk = PASSWORD_RULES.every(rule => rule.test(password));
  const validateEmail = (value: string) =>
    emailSchema.safeParse(value).success ? undefined : EMAIL_FIX;
  const handleProblem = (): string | undefined => {
    if (!handle) return "Choose your page URL.";
    if (urlStatus === "Unavailable") return `amped.bio/${handle} is taken. Pick another.`;
    if (urlStatus === "TooShort") return `Use at least ${HANDLE_MIN_LENGTH} characters`;
    if (urlStatus === "Invalid") return "Use lowercase letters, numbers, hyphens or underscores";
    return undefined;
  };

  const submit = async () => {
    setCardError(null);
    setCaptchaFailed(false);
    const nextHandle = handleProblem();
    const nextEmail = validateEmail(email);
    const nextPassword = passwordOk ? undefined : "Meet every password rule below.";
    setHandleError(nextHandle);
    setEmailError(nextEmail);
    setPasswordError(nextPassword);
    if (nextHandle) return handleRef.current?.focus();
    if (nextEmail) return emailRef.current?.focus();
    if (nextPassword) return passwordRef.current?.focus();

    setLoading(true);
    try {
      const token = await executeCaptcha();
      if (isCaptchaEnabled && !token) {
        setCaptchaFailed(true);
        return;
      }
      const response = await authClient.signUp.email({
        email,
        password,
        name: handle,
        handle,
        callbackURL: window.location.href,
        fetchOptions: {
          query: referrerId ? { referrerId } : undefined,
          headers: token ? { "x-captcha-response": token } : undefined,
        },
      });
      if (response?.error) {
        const kind = classifyAuthError(response.error);
        const text = `${response.error.code ?? ""} ${response.error.message ?? ""}`;
        if (/handle/i.test(text)) {
          setHandleError(`amped.bio/${handle} is taken. Pick another.`);
          handleRef.current?.focus();
        } else if (kind === "emailTaken") {
          setEmailError(EMAIL_TAKEN);
          emailRef.current?.focus();
        } else if (kind === "captcha") setCaptchaFailed(true);
        else setCardError("network");
        return;
      }
      if (referrerId) clearReferrerId();
      goTo(getPostAuthDestination(params, { welcome: true }));
    } catch {
      setCardError("network");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    trackGAEvent("Click", "AuthCard", "GoogleSignUp");
    setCardError(null);
    setGoogleLoading(true);
    const failure = await startGoogleSignIn({
      callbackURL: toAbsoluteUrl(getPostAuthDestination(params)),
      newUserCallbackURL: toAbsoluteUrl(getPostAuthDestination(params, { welcome: true })),
      errorCallbackURL: toAbsoluteUrl("/register?error=google"),
      // Only a handle the check confirmed; the server checks it again
      handle: urlStatus === "Available" ? handle : undefined,
      referrerId,
    });
    if (failure) {
      setGoogleLoading(false);
      setCardError("google");
    }
  };

  const busy = loading || googleLoading;
  const showChecklist = passwordFocused || !!passwordError;

  return (
    <AuthCard
      title="Claim your page"
      subtitle="Free to start. Your page goes live the moment you sign up."
      notice={
        <>
          {referrer?.handle && (
            <Notice variant="warning" title={`Invited by @${referrer.handle}`}>
              <p>
                You and{" "}
                <a
                  href={`/${referrer.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="prism-focus font-semibold underline underline-offset-2"
                >
                  @{referrer.handle}
                </a>{" "}
                each receive a tREVO bonus after you both connect a wallet.
              </p>
              <p className="mt-2">{TESTNET_NOTICE}</p>
            </Notice>
          )}
          {cardError && (
            <Notice
              ref={noticeRef}
              tabIndex={-1}
              role="alert"
              variant="warning"
              className="outline-none"
              title={cardError === "google" ? GOOGLE_FAILED_TITLE : "Your account was not created"}
            >
              <p>
                {cardError === "google"
                  ? GOOGLE_FAILED_BODY
                  : "Check your connection and try again."}
              </p>
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => void (cardError === "google" ? google() : submit())}
              >
                Retry
              </Button>
            </Notice>
          )}
        </>
      }
      footer={
        <>
          <AuthSwitchLine
            text="Already have an account?"
            action={
              <Button variant="ghost" asChild data-testid="switch-to-login">
                <Link href={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`}>
                  Sign in
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
        data-testid="register-form"
        className="space-y-[21px]"
        onSubmit={event => {
          event.preventDefault();
          trackGAEvent("Click", "AuthCard", "CreateAccountButton");
          void submit();
        }}
      >
        <div className="space-y-2">
          <Input
            ref={handleRef}
            id="register-handle"
            data-testid="register-handle"
            label="Your page URL"
            prefix="amped.bio/"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            value={handle}
            error={handleError}
            aria-describedby={handleError ? "register-handle-note" : "register-handle-status"}
            onChange={event => {
              setHandle(cleanHandleInput(event.target.value));
              setHandleError(undefined);
            }}
          />
          {!handleError && (
            <HandleStatusLine
              id="register-handle-status"
              status={urlStatus}
              handle={handle}
              onRetry={recheck}
            />
          )}
        </div>
        <Input
          ref={emailRef}
          id="register-email"
          data-testid="register-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          error={emailError}
          onChange={event => setEmail(event.target.value)}
          onBlur={() => email && setEmailError(validateEmail(email))}
          errorAction={
            emailError === EMAIL_TAKEN ? (
              <Button variant="ghost" size="sm" className="-my-3" asChild>
                <Link href={`/login?email=${encodeURIComponent(email)}`}>Sign in</Link>
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-2">
          <PasswordInput
            ref={passwordRef}
            id="register-password"
            data-testid="register-password"
            label="Password"
            autoComplete="new-password"
            value={password}
            error={passwordError}
            aria-describedby={`register-password-rules${passwordError ? " register-password-note" : ""}`}
            onChange={event => {
              setPassword(event.target.value);
              if (passwordError && PASSWORD_RULES.every(rule => rule.test(event.target.value)))
                setPasswordError(undefined);
            }}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
          <ul
            id="register-password-rules"
            aria-live="polite"
            className={cn("space-y-[5px] font-prism text-prism-meta", !showChecklist && "sr-only")}
          >
            {PASSWORD_RULES.map(rule => {
              const met = rule.test(password);
              return (
                <li
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-1.5",
                    met ? "text-prism-success" : "text-prism-ink-2"
                  )}
                >
                  {met ? (
                    <CircleCheck className="h-[13px] w-[13px] shrink-0" aria-hidden />
                  ) : (
                    <Circle className="h-[13px] w-[13px] shrink-0" aria-hidden />
                  )}
                  {rule.label}
                  {met && <span className="sr-only">, met</span>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="space-y-3 pt-[13px]">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy}
            aria-busy={loading || undefined}
            data-testid="register-submit"
          >
            {loading && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {loading ? "Creating account" : "Create account"}
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

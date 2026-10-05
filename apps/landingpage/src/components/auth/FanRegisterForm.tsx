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
  classifyAuthError,
  cn,
  startGoogleSignIn,
} from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { normalizeHandle } from "@/lib/handle";
import { useCaptcha } from "@/hooks/useCaptcha";
import { goTo, toAbsoluteUrl } from "@/lib/panel";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";
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

/**
 * Fan Graph (#22, board fg4): sign up from Follow. Name, email and password, no
 * page URL field. The server makes a fan account with a handle from the name
 * and no published page, then the person returns to the creator's page with
 * ?follow=1, which finishes the follow.
 */
export function FanRegisterForm() {
  const params = useSearchParams();
  const creatorHandle = normalizeHandle(params.get("creator") ?? "");
  // Back to the creator page; it completes the follow on load
  const returnTo = `/${creatorHandle}?follow=1`;
  const { executeCaptcha, isCaptchaEnabled } = useCaptcha();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [cardError, setCardError] = useState<"network" | "google" | null>(
    params.get("error") === "google" ? "google" : null
  );
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  // The creator's name comes from the server, never from the URL
  const { data: creator } = useQuery({
    ...trpc.handle.getHandle.queryOptions({ handle: creatorHandle }),
    enabled: !!creatorHandle,
    retry: false,
  });
  const creatorName = creator?.user.name || `@${creatorHandle}`;

  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cardError) noticeRef.current?.focus();
  }, [cardError]);

  const passwordOk = PASSWORD_RULES.every(rule => rule.test(password));
  const validateEmail = (value: string) =>
    emailSchema.safeParse(value).success ? undefined : EMAIL_FIX;

  const submit = async () => {
    setCardError(null);
    setCaptchaFailed(false);
    const nextName = name.trim() ? undefined : "Enter your name.";
    const nextEmail = validateEmail(email);
    const nextPassword = passwordOk ? undefined : "Meet every password rule below.";
    setNameError(nextName);
    setEmailError(nextEmail);
    setPasswordError(nextPassword);
    if (nextName) return nameRef.current?.focus();
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
        name: name.trim(),
        callbackURL: toAbsoluteUrl(returnTo),
        fetchOptions: {
          query: { intent: "follow" },
          headers: token ? { "x-captcha-response": token } : undefined,
        },
      });
      if (response?.error) {
        const kind = classifyAuthError(response.error);
        if (kind === "emailTaken") {
          setEmailError(EMAIL_TAKEN);
          emailRef.current?.focus();
        } else if (kind === "captcha") setCaptchaFailed(true);
        else setCardError("network");
        return;
      }
      goTo(returnTo);
    } catch {
      setCardError("network");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setCardError(null);
    setGoogleLoading(true);
    const failure = await startGoogleSignIn({
      callbackURL: toAbsoluteUrl(returnTo),
      newUserCallbackURL: toAbsoluteUrl(returnTo),
      errorCallbackURL: toAbsoluteUrl(
        `/register?intent=follow&creator=${encodeURIComponent(creatorHandle)}&error=google`
      ),
      intent: "follow",
    });
    if (failure) {
      setGoogleLoading(false);
      setCardError("google");
    }
  };

  const busy = loading || googleLoading;
  const showChecklist = passwordFocused || !!passwordError;
  const signInHref = `/login?returnTo=${encodeURIComponent(returnTo)}${
    email ? `&email=${encodeURIComponent(email)}` : ""
  }`;

  return (
    <AuthCard
      title={`Follow ${creatorName}`}
      subtitle="An account lets you follow creators and get their updates. You can make your own page later."
      notice={
        cardError && (
          <Notice
            ref={noticeRef}
            tabIndex={-1}
            role="alert"
            variant="warning"
            className="outline-none"
            title={cardError === "google" ? GOOGLE_FAILED_TITLE : "Your account was not created"}
          >
            <p>
              {cardError === "google" ? GOOGLE_FAILED_BODY : "Check your connection and try again."}
            </p>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => void (cardError === "google" ? google() : submit())}
            >
              Retry
            </Button>
          </Notice>
        )
      }
      footer={
        <>
          <AuthSwitchLine
            text="Have an account?"
            action={
              <Button variant="ghost" asChild data-testid="fan-switch-to-login">
                <Link href={signInHref}>Sign in</Link>
              </Button>
            }
          />
          <AuthLegalLine privacyHref={PRIVACY_POLICY_URL} />
        </>
      }
    >
      <form
        noValidate
        data-testid="fan-register-form"
        className="space-y-[21px]"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          ref={nameRef}
          id="fan-register-name"
          label="Name"
          autoComplete="name"
          value={name}
          error={nameError}
          onChange={event => {
            setName(event.target.value);
            setNameError(undefined);
          }}
        />
        <Input
          ref={emailRef}
          id="fan-register-email"
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
                <Link href={signInHref}>Sign in</Link>
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-2">
          <PasswordInput
            ref={passwordRef}
            id="fan-register-password"
            label="Password"
            autoComplete="new-password"
            value={password}
            error={passwordError}
            aria-describedby="fan-register-password-rules"
            onChange={event => {
              setPassword(event.target.value);
              if (passwordError && PASSWORD_RULES.every(rule => rule.test(event.target.value)))
                setPasswordError(undefined);
            }}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
          <ul
            id="fan-register-password-rules"
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
            data-testid="fan-register-submit"
          >
            {loading && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {loading ? "Creating account" : "Create account and follow"}
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

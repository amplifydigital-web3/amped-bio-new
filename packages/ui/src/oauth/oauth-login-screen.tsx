"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { authClient } from "../auth-client";
import { Button } from "../button";
import { Input } from "../input";
import { Notice } from "../prism/states";
import {
  AuthLegalLine,
  AuthSwitchLine,
  CAPTCHA_FAILED,
  GOOGLE_FAILED_BODY,
  GOOGLE_FAILED_TITLE,
  GoogleSignInButton,
  InlineError,
  OrDivider,
  PasswordInput,
  SUPPORT_TICKET_URL,
  classifyAuthError,
  startGoogleSignIn,
} from "../prism/auth";
import { navigateToProviderRedirect, useOAuthFlowQuery } from "./use-oauth-flow-query";

const emailSchema = z.string().email();

/** Display name of the application that started the flow, when the provider knows it. */
export function useOAuthClientName(): string | null {
  const { clientId } = useOAuthFlowQuery();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then(response => {
        const clientName = (response?.data as { client_name?: string } | null)?.client_name;
        if (active && clientName) setName(clientName);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [clientId]);

  return name;
}

interface OAuthLoginScreenProps {
  /** Rendered only when the deployment has a Google client id configured. */
  googleEnabled?: boolean;
  /** Proof-of-work captcha provider of the host application. */
  getCaptchaToken?: () => Promise<string | null>;
  /** True when the host runs the captcha, so a missing token is a failure. */
  captchaRequired?: boolean;
  /** Called when the flow completes without a provider redirect. */
  onSignedIn?: () => void;
  /** Reset password page for the typed email, keeping the authorize request. */
  forgotPasswordHref?: (email: string) => string;
  /** Register page, keeping the authorize request. */
  createAccountHref?: string;
  privacyHref?: string;
}

type CardError = "blocked" | "network" | "google" | null;

// Hosted sign in for third party apps (Screen Review 009 I19, I20): the sign in
// stack of the shared auth card. Recovery paths keep the authorize request.
export function OAuthLoginScreen({
  googleEnabled = false,
  getCaptchaToken,
  captchaRequired = false,
  onSignedIn,
  forgotPasswordHref,
  createAccountHref,
  privacyHref = "https://ampedbio.com/privacy-policy/",
}: OAuthLoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [cardError, setCardError] = useState<CardError>(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardError) noticeRef.current?.focus();
  }, [cardError]);

  const validateEmail = (value: string) =>
    emailSchema.safeParse(value).success ? undefined : "Enter an email like name@example.com.";

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
      const token = getCaptchaToken ? await getCaptchaToken() : null;
      if (captchaRequired && !token) {
        setCaptchaFailed(true);
        return;
      }
      const response = await authClient.signIn.email(
        { email, password, rememberMe: true },
        { headers: token ? { "x-captcha-response": token } : undefined }
      );
      if (response?.error) {
        const kind = classifyAuthError(response.error);
        if (kind === "credentials") {
          setPasswordError("Email or password is incorrect.");
          passwordRef.current?.focus();
        } else if (kind === "captcha") setCaptchaFailed(true);
        else if (kind === "blocked") setCardError("blocked");
        else setCardError("network");
        return;
      }
      if (!navigateToProviderRedirect(response?.data)) onSignedIn?.();
    } catch {
      setCardError("network");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setCardError(null);
    setGoogleLoading(true);
    const here = `${window.location.pathname}${window.location.search}`;
    const failure = await startGoogleSignIn({ callbackURL: here, errorCallbackURL: here });
    if (failure) {
      setGoogleLoading(false);
      setCardError("google");
    }
  };

  const busy = loading || googleLoading;

  return (
    <div className="font-prism">
      {cardError && (
        <Notice
          ref={noticeRef}
          tabIndex={-1}
          role="alert"
          variant="warning"
          className="mb-[21px] outline-none"
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
              onClick={cardError === "google" ? google : submit}
            >
              Retry
            </Button>
          )}
        </Notice>
      )}

      <form
        noValidate
        className="space-y-[21px]"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          ref={emailRef}
          id="oauth-email"
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
          id="oauth-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          error={passwordError}
          onChange={event => setPassword(event.target.value)}
          labelAction={
            forgotPasswordHref ? (
              <a
                href={forgotPasswordHref(email)}
                className="prism-focus -my-3 inline-flex h-touch items-center rounded-prism-8 px-1 text-prism-meta font-semibold text-prism-nav"
              >
                Forgot password
              </a>
            ) : undefined
          }
          errorAction={
            passwordError === "Email or password is incorrect." && forgotPasswordHref ? (
              <Button variant="ghost" size="sm" className="-my-3" asChild>
                <a href={forgotPasswordHref(email)}>Reset password</a>
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-3 pt-[13px]">
          <Button type="submit" size="lg" className="w-full" disabled={busy} aria-busy={loading}>
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
          <GoogleSignInButton loading={googleLoading} disabled={loading} onClick={google} />
        </>
      )}

      <div className="mt-[21px] space-y-3">
        {createAccountHref && (
          <AuthSwitchLine
            text="New to Amped.Bio?"
            action={
              <Button variant="ghost" asChild>
                <a href={createAccountHref}>Create account</a>
              </Button>
            }
          />
        )}
        <AuthLegalLine privacyHref={privacyHref} />
      </div>
    </div>
  );
}

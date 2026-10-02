"use client";
import * as React from "react";
import { AlertCircle, Eye, EyeOff, Info, LoaderCircle } from "lucide-react";
import { cn } from "../utils";
import { Button } from "../button";
import { Input } from "../input";
import { authClient } from "../auth-client";

// Prism auth pieces (Screen Review 008 to 010, 019; app structure D20). One
// auth card serves sign in, register, the OAuth screens and later reset,
// verify, resend and two factor.

/* -------------------------------------------------------------------------- */
/* AuthCard                                                                    */
/* -------------------------------------------------------------------------- */

// G1 clear card r21, no rim, 508 wide centered (full width minus 13 gutters on
// mobile), padding 34 (21 on mobile). h1 20/23, subtitle 16/26, then the
// notice slot, the fields, and the footer lines. It enters with a 233ms fade
// and 8 upward travel; instant under reduced motion.
export function AuthCard({
  title,
  subtitle,
  notice,
  icon,
  centered = false,
  titleRef,
  status = false,
  children,
  footer,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // Solid compliance notice at the card top (referral, failures)
  notice?: React.ReactNode;
  // Status disc above the title for result states (011 to 015)
  icon?: React.ReactNode;
  centered?: boolean;
  // Result states move focus to the title on render
  titleRef?: React.Ref<HTMLHeadingElement>;
  // Announce the title and subtitle as a status (result states)
  status?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "prism-glass-clear mx-auto w-full max-w-[508px] p-[21px] font-prism text-prism-ink sm:p-[34px]",
        "duration-prism-control ease-prism animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none",
        centered && "text-center",
        className
      )}
    >
      {notice && <div className="mb-[21px] space-y-3 text-left">{notice}</div>}
      <div role={status ? "status" : undefined}>
        {icon && <div className={cn("mb-[21px]", centered && "flex justify-center")}>{icon}</div>}
        <h1
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="text-prism-panel-title text-prism-ink outline-none"
        >
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-prism-body text-prism-ink-2">{subtitle}</p>}
      </div>
      {children && <div className="mt-[21px]">{children}</div>}
      {footer && <div className="mt-[21px] space-y-3">{footer}</div>}
    </section>
  );
}

// G1 clear status disc 55 with a 34 icon (011 to 015). Success, danger or
// navigate color; stands in for the G4 success moment until v1.1.
export function StatusDisc({
  icon: Icon,
  tone,
}: {
  icon: React.ElementType;
  tone: "success" | "danger" | "nav";
}) {
  return (
    <span className="prism-glass-clear inline-flex h-[55px] w-[55px] shrink-0 items-center justify-center rounded-full">
      <Icon
        aria-hidden
        className={cn(
          "h-[34px] w-[34px]",
          tone === "success" && "text-prism-success",
          tone === "danger" && "text-prism-danger",
          tone === "nav" && "text-prism-nav"
        )}
      />
    </span>
  );
}

// Card skeleton for a slow session check: title bar, two fields, button.
export function AuthCardSkeleton() {
  return (
    <div
      aria-hidden
      className="prism-glass-clear mx-auto w-full max-w-[508px] space-y-[21px] p-[21px] sm:p-[34px]"
    >
      <span className="block h-5 w-40 rounded-prism-13 bg-prism-line" />
      <span className="block h-touch w-full rounded-prism-13 bg-prism-line" />
      <span className="block h-touch w-full rounded-prism-13 bg-prism-line" />
      <span className="block h-commit w-full rounded-prism-13 bg-prism-line" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "trailing"> & {
  // Controlled reveal, for one toggle that shows two fields (013 I07)
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  // Ids of every field the toggle reveals (aria-controls)
  toggleControls?: string;
};

// Password well with a 44 show toggle (aria-pressed) and a Caps Lock hint.
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      helper,
      onKeyUp,
      onKeyDown,
      onBlur,
      visible: visibleProp,
      onVisibleChange,
      toggleControls,
      ...props
    },
    ref
  ) {
    const [visibleState, setVisibleState] = React.useState(false);
    const visible = visibleProp ?? visibleState;
    const setVisible = (update: (value: boolean) => boolean) => {
      const next = update(visible);
      setVisibleState(next);
      onVisibleChange?.(next);
    };
    const [capsLock, setCapsLock] = React.useState(false);
    const readCaps = (event: React.KeyboardEvent<HTMLInputElement>) =>
      setCapsLock(event.getModifierState?.("CapsLock") ?? false);

    return (
      <div className="space-y-2">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          helper={capsLock && !props.error ? undefined : helper}
          onKeyUp={event => {
            readCaps(event);
            onKeyUp?.(event);
          }}
          onKeyDown={event => {
            readCaps(event);
            onKeyDown?.(event);
          }}
          onBlur={event => {
            setCapsLock(false);
            onBlur?.(event);
          }}
          trailing={
            <button
              type="button"
              aria-label={visible ? "Hide password" : "Show password"}
              aria-pressed={visible}
              aria-controls={toggleControls ?? props.id}
              onClick={() => setVisible(value => !value)}
              className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2"
            >
              {visible ? (
                <EyeOff className="h-[21px] w-[21px]" aria-hidden />
              ) : (
                <Eye className="h-[21px] w-[21px]" aria-hidden />
              )}
            </button>
          }
          {...props}
        />
        {capsLock && (
          <p className="flex items-center gap-1.5 font-prism text-prism-meta text-prism-ink-2">
            <Info className="h-4 w-4 shrink-0 text-prism-nav" aria-hidden />
            Caps Lock is on
          </p>
        )}
      </div>
    );
  }
);

// A local failure line under a primary button, with one ghost action. Used for
// the captcha convention: "The browser check did not finish. Check your
// connection." plus Try again.
export function InlineError({
  children,
  action,
  id,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div role="alert" id={id} className="flex flex-wrap items-center gap-x-2 gap-y-1 font-prism">
      <p className="flex items-start gap-1.5 text-prism-meta text-prism-danger">
        <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
        {children}
      </p>
      {action}
    </div>
  );
}

export const CAPTCHA_FAILED = "The browser check did not finish. Check your connection.";

/* -------------------------------------------------------------------------- */
/* Google                                                                      */
/* -------------------------------------------------------------------------- */

// The or divider: 13/16 ink-2 between two line rules, 21 above and below.
export function OrDivider() {
  return (
    <div className="my-[21px] flex items-center gap-3 font-prism" role="separator">
      <span aria-hidden className="h-px flex-1 bg-prism-line" />
      <span className="text-prism-meta text-prism-ink-2">or</span>
      <span aria-hidden className="h-px flex-1 bg-prism-line" />
    </div>
  );
}

// Google's standard multicolor G at 21, unaltered (Screen Review 010 D1).
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-[21px] w-[21px] shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export interface GoogleSignInOptions {
  // Where a returning user lands (the panel /home or a safe redirect)
  callbackURL: string;
  // Where a new account lands (the panel /home?welcome=1)
  newUserCallbackURL?: string;
  // Where Google sends the person back after a cancel or failure (?error=google)
  errorCallbackURL?: string;
  // Sign up only: the claimed handle when it is available
  handle?: string;
  referrerId?: number;
}

// Starts Google OAuth. Resolves with an error message when better-auth refuses
// before the redirect; a successful start navigates away.
export async function startGoogleSignIn(options: GoogleSignInOptions): Promise<string | null> {
  const additionalData: Record<string, string> = {};
  if (options.handle) additionalData.handle = options.handle;
  if (options.referrerId) additionalData.referrerId = String(options.referrerId);
  try {
    const response = await authClient.signIn.social({
      provider: "google",
      callbackURL: options.callbackURL,
      newUserCallbackURL: options.newUserCallbackURL,
      errorCallbackURL: options.errorCallbackURL,
      additionalData: Object.keys(additionalData).length ? additionalData : undefined,
      fetchOptions: {
        query: options.referrerId ? { referrerId: options.referrerId } : undefined,
      },
    });
    if (response?.error) return response.error.message || "google";
    return null;
  } catch (error) {
    return (error as Error).message || "google";
  }
}

// Continue with Google as a secondary lens 44, full width (Screen Review 010).
// While Google opens: a spinner replaces the G, the label reads Opening Google.
export function GoogleSignInButton({
  loading = false,
  disabled = false,
  onClick,
}: {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      data-testid="google-sign-in"
    >
      {loading ? (
        <LoaderCircle
          className="h-[21px] w-[21px] animate-spin text-prism-nav motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        <GoogleMark />
      )}
      {loading ? "Opening Google" : "Continue with Google"}
    </Button>
  );
}

// Google failure notice copy (Screen Review 010 I05).
export const GOOGLE_FAILED_TITLE = "Google sign in did not finish";
export const GOOGLE_FAILED_BODY = "Choose your Google account again or use your email below.";

/* -------------------------------------------------------------------------- */
/* Legal line                                                                  */
/* -------------------------------------------------------------------------- */

export function AuthLegalLine({ privacyHref }: { privacyHref: string }) {
  return (
    <p className="font-prism text-prism-meta text-prism-ink-2">
      By continuing you agree to our{" "}
      <a
        href={privacyHref}
        target="_blank"
        rel="noopener noreferrer"
        className="prism-focus font-semibold text-prism-nav underline underline-offset-2"
        data-testid="privacy-policy-link"
      >
        Privacy Policy
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </p>
  );
}

// Footer line: a sentence then a ghost button (Create account, Sign in).
export function AuthSwitchLine({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1 font-prism text-prism-body text-prism-ink-2">
      {text}
      {action}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export type AuthErrorKind =
  | "credentials"
  | "blocked"
  | "captcha"
  | "emailTaken"
  | "unverified"
  | "network"
  | "unknown";

// Maps a better-auth error to a plain cause. The raw server message is never
// shown: the blocked account message carries a raw support URL, for example.
export function classifyAuthError(error: unknown): AuthErrorKind {
  if (!error || typeof error !== "object") return "unknown";
  const { code, message, status } = error as {
    code?: string;
    message?: string;
    status?: number;
  };
  const text = `${code ?? ""} ${message ?? ""}`;
  if (/captcha|MISSING_RESPONSE|VERIFICATION_FAILED/i.test(text)) return "captcha";
  if (/INVALID_EMAIL_OR_PASSWORD|invalid email or password/i.test(text) || status === 401)
    return "credentials";
  if (/blocked/i.test(text)) return "blocked";
  if (/USER_ALREADY_EXISTS|already exists/i.test(text) || status === 422) return "emailTaken";
  if (/EMAIL_NOT_VERIFIED/i.test(text)) return "unverified";
  if (error instanceof TypeError || /fetch|network/i.test(text) || status === 0) return "network";
  return "unknown";
}

export const SUPPORT_TICKET_URL = "https://amplifydigital.freshdesk.com/support/tickets/new";

/* -------------------------------------------------------------------------- */
/* Resend cooldown                                                             */
/* -------------------------------------------------------------------------- */

export const RESEND_COOLDOWN_SECONDS = 60;

// Counts down after a send so a person cannot flood their inbox (012 I05).
// start() begins the countdown; remaining is 0 when Resend may run again.
export function useCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
  const [endsAt, setEndsAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  React.useEffect(() => {
    if (endsAt !== null && remaining === 0) setEndsAt(null);
  }, [endsAt, remaining]);
  const start = React.useCallback(() => {
    const at = Date.now();
    setNow(at);
    setEndsAt(at + seconds * 1000);
  }, [seconds]);
  return { remaining, start };
}

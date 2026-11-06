/* eslint-disable react-refresh/only-export-components */
import { forwardRef, type ButtonHTMLAttributes, type PropsWithChildren } from "react";
import { vi } from "vitest";

/**
 * Minimal stand-in for the `@repo/ui` surface used by the auth forms. Loaded
 * with `vi.mock("@repo/ui", () => import("@/test/mocks/ui"))` so the tests
 * never import the real ui index (better-auth and other browser-only modules).
 * Mirror the real imports of the forms: AuthCard, AuthSwitchLine, AuthLegalLine,
 * Button, GoogleSignInButton, InlineError, Input, Notice, OrDivider,
 * PasswordInput, Notice/error constants and helpers.
 */

export const CAPTCHA_FAILED = "The browser check did not finish. Check your connection.";
export const GOOGLE_FAILED_TITLE = "Google sign in did not finish";
export const GOOGLE_FAILED_BODY = "Choose your Google account again or use your email below.";
export const SUPPORT_TICKET_URL = "https://example.test/support/tickets/new";
export const TESTNET_NOTICE = "tREVO is a test token.";

/** Same logic as packages/ui/src/prism/auth.tsx so error branches behave alike. */
export function classifyAuthError(error: unknown): string {
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

export const startGoogleSignIn = vi.fn(() => Promise.resolve<string | null>(null));

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; size?: string; variant?: string }
>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, type = "button", ...props },
  ref
) {
  return (
    <button ref={ref} type={type} {...props}>
      {children}
    </button>
  );
});

interface FieldProps extends Omit<ButtonHTMLAttributes<HTMLInputElement>, "error"> {
  id: string;
  label: string;
  error?: string;
  errorAction?: React.ReactNode;
  labelAction?: React.ReactNode;
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, FieldProps>(function Input(
  { id, label, error, errorAction, labelAction, prefix, ...props },
  ref
) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {labelAction}
      <div>
        {prefix && <span>{prefix}</span>}
        <input
          ref={ref}
          id={id}
          data-testid={id}
          aria-invalid={error ? true : undefined}
          {...props}
        />
      </div>
      {error && <span role="alert">{error}</span>}
      {errorAction}
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, FieldProps>(function PasswordInput(
  { id, label, error, errorAction, labelAction, ...props },
  ref
) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {labelAction}
      <input
        ref={ref}
        id={id}
        data-testid={id}
        type="password"
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <span role="alert">{error}</span>}
      {errorAction}
    </div>
  );
});

export function AuthCard({
  title,
  subtitle,
  notice,
  footer,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: React.ReactNode;
  notice?: React.ReactNode;
  footer?: React.ReactNode;
}>) {
  return (
    <div data-testid="auth-card">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {notice}
      {children}
      {footer}
    </div>
  );
}

export function AuthSwitchLine({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <div>
      {text} {action}
    </div>
  );
}

export function AuthLegalLine({ privacyHref }: { privacyHref: string }) {
  return <a href={privacyHref}>Privacy Policy</a>;
}

export function InlineError({ children, action }: PropsWithChildren<{ action?: React.ReactNode }>) {
  return (
    <div role="alert">
      {children}
      {action}
    </div>
  );
}

export const Notice = forwardRef<HTMLDivElement, PropsWithChildren<any>>(function Notice(
  { title, children, ...props },
  ref
) {
  return (
    <div ref={ref} {...props}>
      <strong>{title}</strong>
      {children}
    </div>
  );
});

export function OrDivider() {
  return <div>or</div>;
}

export function GoogleSignInButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      Continue with Google
      {loading && " (loading)"}
    </button>
  );
}

"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, LoaderCircle } from "lucide-react";
import {
  AuthCard,
  AuthLegalLine,
  Button,
  Checkbox,
  Input,
  Notice,
  navigateToProviderRedirect,
} from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { CodeInput } from "@/components/auth/CodeInput";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";
import { getPostAuthDestination, goTo } from "@/lib/panel";

const WRONG_CODE = "That code did not work. Codes change every 30 seconds, so use the newest one.";
const WRONG_BACKUP = "That backup code did not work. Check it and try again.";

type Blocked = "attempts" | "timeout" | null;

// Backup codes look like ABCDE-12345; pasted lists may carry a "1. " prefix
const cleanBackup = (value: string) => value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 11);
const cleanPastedBackup = (value: string) =>
  cleanBackup(value.replace(/^[^a-zA-Z0-9]*\d+\.\s*/, ""));

// Two factor challenge (Screen Review 014): the shared auth card with one job.
// Six digit wells that submit on the sixth digit, Verify, Trust this device,
// backup mode in place, Sign out and go back.
function TwoFactorChallenge() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Switching modes moves focus to the new input (014 I08)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    (mode === "totp" ? codeRef : backupRef).current?.focus();
  }, [mode]);

  useEffect(() => {
    if (blocked) noticeRef.current?.focus();
  }, [blocked]);

  const succeed = (data: unknown) => {
    // OAuth flows continue at the provider; otherwise a safe returnTo or Home
    if (navigateToProviderRedirect(data)) return;
    goTo(getPostAuthDestination(params));
  };

  const fail = (failure: { code?: string; status?: number } | null | undefined) => {
    const code = failure?.code ?? "";
    if (/TOO_MANY|LOCKED/.test(code) || failure?.status === 429) return setBlocked("attempts");
    if (/INVALID_TWO_FACTOR_COOKIE/.test(code) || failure?.status === 401)
      return setBlocked("timeout");
    setError(mode === "totp" ? WRONG_CODE : WRONG_BACKUP);
    if (mode === "totp") {
      setCode("");
      setTimeout(() => codeRef.current?.focus());
    } else {
      setTimeout(() => backupRef.current?.focus());
    }
  };

  const verifyTotp = async (value: string) => {
    if (value.length !== 6) return codeRef.current?.focus();
    setLoading(true);
    setError(null);
    try {
      const { data, error: verifyError } = await authClient.twoFactor.verifyTotp({
        code: value,
        trustDevice,
      });
      if (verifyError) {
        console.error("Two factor verification failed:", verifyError);
        return fail(verifyError);
      }
      succeed(data);
    } catch (err) {
      console.error("Two factor verification failed:", err);
      setError("The code could not be checked. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyBackup = async () => {
    const value = backupCode.trim();
    if (!value) {
      setError("Enter one of your backup codes.");
      return backupRef.current?.focus();
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: verifyError } = await authClient.twoFactor.verifyBackupCode({
        code: value,
        trustDevice,
      });
      if (verifyError) {
        console.error("Backup code verification failed:", verifyError);
        return fail(verifyError);
      }
      succeed(data);
    } catch (err) {
      console.error("Backup code verification failed:", err);
      setError("The code could not be checked. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const signOutAndGoBack = async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    } finally {
      window.location.href = "/";
    }
  };

  const switchMode = () => {
    setError(null);
    setCode("");
    setBackupCode("");
    setMode(current => (current === "totp" ? "backup" : "totp"));
  };

  const signInAgain = `/login${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <AuthCard
      title={mode === "totp" ? "Enter your code" : "Use a backup code"}
      subtitle={
        mode === "totp"
          ? "Open your authenticator app and type the 6 digit code for Amped.Bio."
          : "Enter one of the codes you saved when you turned on two factor."
      }
      notice={
        blocked ? (
          <Notice
            ref={noticeRef}
            tabIndex={-1}
            role="alert"
            variant="warning"
            className="outline-none"
            title={blocked === "attempts" ? "Too many attempts" : undefined}
          >
            <p>
              {blocked === "attempts"
                ? "Wait a few minutes, then sign in again."
                : "Your sign in timed out."}
            </p>
            <Button className="mt-2" asChild>
              <a href={signInAgain}>Sign in again</a>
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
          void (mode === "totp" ? verifyTotp(code) : verifyBackup());
        }}
      >
        {mode === "totp" ? (
          <div className="space-y-2">
            <CodeInput
              ref={codeRef}
              value={code}
              onChange={value => {
                setCode(value);
                if (error) setError(null);
              }}
              onComplete={value => void verifyTotp(value)}
              disabled={loading}
              invalid={!!error}
              describedBy={error ? "two-factor-error" : undefined}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              ref={backupRef}
              id="two-factor-backup"
              label="Backup code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              value={backupCode}
              disabled={loading}
              helper="Looks like ABCDE-12345"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "two-factor-error" : undefined}
              onChange={event => {
                setBackupCode(cleanBackup(event.target.value));
                if (error) setError(null);
              }}
              onPaste={event => {
                event.preventDefault();
                setBackupCode(cleanPastedBackup(event.clipboardData.getData("text")));
              }}
            />
          </div>
        )}

        {error && (
          <p
            id="two-factor-error"
            role="alert"
            className="mt-[13px] flex items-start gap-1.5 font-prism text-prism-meta text-prism-danger"
          >
            <AlertCircle className="mt-px h-[21px] w-[21px] shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <div className="pt-[34px]">
          <Button type="submit" size="lg" className="w-full" disabled={loading} aria-busy={loading}>
            {loading && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {loading ? "Verifying" : "Verify"}
          </Button>
        </div>
      </form>

      <div className="mt-[21px]">
        <Checkbox checked={trustDevice} onCheckedChange={setTrustDevice}>
          Trust this device for 30 days
        </Checkbox>
      </div>
      <div className="mt-[13px]">
        <Button variant="ghost" onClick={switchMode} disabled={loading}>
          {mode === "totp" ? "Use a backup code instead" : "Use your authenticator app"}
        </Button>
      </div>
      <div className="mt-[21px] border-t border-prism-line pt-[21px]">
        <Button variant="ghost" onClick={() => void signOutAndGoBack()} disabled={loading}>
          Sign out and go back
        </Button>
      </div>
    </AuthCard>
  );
}

export default function TwoFactorChallengePage() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <TwoFactorChallenge />
      </Suspense>
    </AuthLayout>
  );
}

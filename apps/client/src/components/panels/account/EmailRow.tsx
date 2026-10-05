import { useEffect, useRef, useState } from "react";
import { OTPInput } from "input-otp";
import { Loader2 } from "lucide-react";
import { Button, trpcClient, useAuth } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { formatClock, useSecondsLeft } from "@/hooks/useSecondsLeft";
import { DisclosureRow, useDisclosureGroup } from "../design/kit/DisclosureRow";
import { FieldError } from "../page/blocks/LinkFields";
import { wellClass } from "../page/blocks/linkValue";
import { CodeSlot, Footer } from "./fields";

// Screen Review 019. Email, the second row of the Account card. A two step
// change in place: New email with Send code, then the six digit code sent to
// the new address. The server sends that code to the new address and a
// notice to the current one (I02). Explicit submit (D11).

export const EMAIL_ROW = "email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_MS = 60_000;

type TrpcLikeError = { data?: { code?: string; retryAfter?: string } | null; message?: string };

function errorCode(error: unknown) {
  return (error as TrpcLikeError)?.data?.code;
}

/** 019 I06: the server sends retryAfter on TOO_MANY_REQUESTS; 60s otherwise. */
function retryDeadline(error: unknown) {
  const raw = (error as TrpcLikeError)?.data?.retryAfter;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed
    : new Date(Date.now() + RESEND_COOLDOWN_MS);
}

function EmailEditor() {
  const { authUser, updateAuthUser } = useAuth();
  const { setOpen } = useDisclosureGroup();
  const currentEmail = authUser?.email ?? "";

  const [step, setStep] = useState<"enter" | "code">("enter");
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [resendAt, setResendAt] = useState<Date | null>(null);
  const [resending, setResending] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const blockedFor = useSecondsLeft(blockedUntil);
  const expiresIn = useSecondsLeft(expiresAt);
  const resendIn = useSecondsLeft(resendAt);
  const expired = step === "code" && expiresAt !== null && expiresIn === 0;
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // 019 I05: format and same address checks, on blur and on submit
  const checkEmail = (value: string) => {
    const trimmed = value.trim();
    if (!EMAIL.test(trimmed)) return "Enter an email like name@example.com";
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) return "This is already your email";
    return null;
  };

  const cancel = () => setOpen(null);

  const codeSent = (expires: Date | string | undefined) => {
    setExpiresAt(expires ? new Date(expires) : new Date(Date.now() + 5 * 60_000));
    setResendAt(new Date(Date.now() + RESEND_COOLDOWN_MS));
    setCode("");
    setCodeError(null);
    setVerifyFailed(false);
    setAnnouncement(`Code sent to ${newEmail.trim()}`);
  };

  const sendCode = async () => {
    const error = checkEmail(newEmail);
    setEmailError(error);
    if (error || sending || blockedFor > 0) return;
    setSending(true);
    setStartFailed(false);
    try {
      const response = await trpcClient.user.initiateEmailChange.mutate({
        currentEmail,
        newEmail: newEmail.trim(),
      });
      codeSent(response.expiresAt);
      setStep("code");
    } catch (failure) {
      const code = errorCode(failure);
      if (code === "CONFLICT") {
        setEmailError("This email belongs to another account. Use a different one.");
      } else if (code === "TOO_MANY_REQUESTS") {
        setBlockedUntil(retryDeadline(failure));
      } else if (code === "BAD_REQUEST") {
        setEmailError("Enter an email like name@example.com");
      } else {
        setStartFailed(true);
      }
    } finally {
      setSending(false);
    }
  };

  const resend = async () => {
    if (resending || resendIn > 0) return;
    setResending(true);
    try {
      const response = await trpcClient.user.resendEmailVerification.mutate({
        currentEmail,
        newEmail: newEmail.trim(),
      });
      codeSent(response.expiresAt);
    } catch (failure) {
      if (errorCode(failure) === "TOO_MANY_REQUESTS") setResendAt(retryDeadline(failure));
      else setCodeError("A new code did not send. Check your connection and try again.");
    } finally {
      setResending(false);
    }
  };

  const verify = async (value: string = code) => {
    if (value.length !== 6 || verifying || expired) return;
    setVerifying(true);
    setCodeError(null);
    setVerifyFailed(false);
    const address = newEmail.trim();
    try {
      await trpcClient.user.confirmEmailChange.mutate({ code: value, newEmail: address });
      // 019 I10: sign in uses the new address from now on
      updateAuthUser({ email: address });
      setOpen(null);
      toast.add({ type: "success", title: `Email changed to ${address}` });
    } catch (failure) {
      const code = errorCode(failure);
      if (code === "BAD_REQUEST") {
        setCodeError("That code is not right. Check the latest email.");
      } else if (code === "CONFLICT") {
        setStep("enter");
        setEmailError("This email belongs to another account. Use a different one.");
      } else {
        setVerifyFailed(true);
      }
    } finally {
      setVerifying(false);
    }
  };

  // Focus follows the step: the email field, or the first code slot (019 I13)
  useEffect(() => {
    if (step === "enter") emailInputRef.current?.focus();
    else codeInputRef.current?.focus();
  }, [step]);

  if (step === "enter") {
    const shownError = emailError;
    return (
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault();
          void sendCode();
        }}
        className="space-y-[21px]"
      >
        <div>
          <p className="text-prism-meta text-prism-ink-2">Current email</p>
          <p className="break-all text-prism-label text-prism-ink">{currentEmail}</p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="new-email"
            className="block text-prism-label font-semibold text-prism-ink"
          >
            New email
          </label>
          <p id="new-email-help" className="text-prism-meta text-prism-ink-2">
            We send a code to your new email to confirm it. Your current email gets a notice.
          </p>
          <div className={wellClass(!!shownError)}>
            <input
              ref={emailInputRef}
              id="new-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={newEmail}
              onChange={event => {
                setNewEmail(event.target.value);
                if (emailError) setEmailError(null);
                setStartFailed(false);
              }}
              onBlur={() => newEmail && setEmailError(checkEmail(newEmail))}
              aria-invalid={!!shownError || undefined}
              aria-describedby={shownError ? "new-email-error" : "new-email-help"}
              className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
            />
          </div>
          {shownError && <FieldError id="new-email-error">{shownError}</FieldError>}
          {startFailed && (
            <div className="flex items-center gap-2">
              <FieldError id="new-email-start">Email change did not start.</FieldError>
              <Button type="submit" variant="ghost">
                Retry
              </Button>
            </div>
          )}
          {blockedFor > 0 && (
            <p role="status" className="text-prism-meta tabular-nums text-prism-ink-2">
              You can request a new code in {formatClock(blockedFor)}
            </p>
          )}
        </div>

        <Footer>
          <Button type="button" variant="secondary" onClick={cancel} className="max-sm:w-full">
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={sending || blockedFor > 0}
            aria-busy={sending}
            className="min-w-[160px] max-sm:w-full"
          >
            {sending && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
            {sending ? "Sending" : "Send code"}
          </Button>
        </Footer>
      </form>
    );
  }

  const address = newEmail.trim();
  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        if (expired) void resend();
        else void verify();
      }}
      className="space-y-[21px]"
    >
      <p className="sr-only" role="status">
        {announcement}
      </p>

      <div className="space-y-2">
        <p id="code-label" className="text-prism-label font-semibold text-prism-ink">
          Code sent to <span className="[overflow-wrap:anywhere]">{address}</span>
        </p>
        <OTPInput
          ref={codeInputRef}
          maxLength={6}
          value={code}
          onChange={value => {
            setCode(value.replace(/\D/g, ""));
            setCodeError(null);
          }}
          // 019 I07: the sixth digit submits; a pasted code fills every slot
          onComplete={value => void verify(value)}
          pattern="^[0-9]*$"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={expired}
          aria-labelledby="code-label"
          aria-describedby={codeError ? "code-error" : "code-expiry"}
          containerClassName="flex items-center gap-2 has-[:disabled]:opacity-50"
        >
          {[0, 1, 2, 3, 4, 5].map(index => (
            <CodeSlot key={index} index={index} invalid={!!codeError} disabled={expired} />
          ))}
        </OTPInput>
        {codeError && <FieldError id="code-error">{codeError}</FieldError>}
        {verifyFailed && (
          <div className="flex items-center gap-2">
            <FieldError id="code-failed">Email did not change.</FieldError>
            <Button type="submit" variant="ghost">
              Retry
            </Button>
          </div>
        )}
        <p id="code-expiry" className="text-prism-meta tabular-nums text-prism-ink-2">
          {expired ? "This code expired." : `Code expires in ${formatClock(expiresIn)}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="-ml-3"
            onClick={() => {
              setStep("enter");
              setCode("");
              setCodeError(null);
            }}
          >
            Use a different email
          </Button>
          {!expired && (
            <Button
              type="button"
              variant="ghost"
              disabled={resendIn > 0 || resending}
              onClick={() => void resend()}
              className="tabular-nums"
            >
              {resendIn > 0 ? `Resend in ${formatClock(resendIn)}` : "Resend code"}
            </Button>
          )}
        </div>
      </div>

      <Footer>
        <Button type="button" variant="secondary" onClick={cancel} className="max-sm:w-full">
          Cancel
        </Button>
        {expired ? (
          <Button
            type="submit"
            size="lg"
            disabled={resending || resendIn > 0}
            aria-busy={resending}
            className="min-w-[160px] max-sm:w-full"
          >
            {resending && (
              <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
            )}
            {resending
              ? "Sending"
              : resendIn > 0
                ? `Send a new code in ${formatClock(resendIn)}`
                : "Send a new code"}
          </Button>
        ) : (
          <Button
            type="submit"
            size="lg"
            disabled={code.length !== 6 || verifying}
            aria-busy={verifying}
            className="min-w-[160px] max-sm:w-full"
          >
            {verifying && (
              <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
            )}
            {verifying ? "Verifying" : "Verify"}
          </Button>
        )}
      </Footer>
    </form>
  );
}

export function EmailRow() {
  const { authUser } = useAuth();
  return (
    <DisclosureRow id={EMAIL_ROW} label="Email" value={authUser?.email ?? ""}>
      <EmailEditor />
    </DisclosureRow>
  );
}

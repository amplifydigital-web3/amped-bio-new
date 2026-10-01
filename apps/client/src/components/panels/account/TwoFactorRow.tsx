import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OTPInput } from "input-otp";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Loader2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Notice,
  StepBar,
  authClient,
  useAuth,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { DisclosureRow, useDisclosureGroup } from "../design/kit/DisclosureRow";
import { FieldError } from "../page/blocks/LinkFields";
import { BackupCodesSlab } from "./BackupCodesSlab";
import { CodeSlot, Footer, PasswordField } from "./fields";

// Screen Review 021. Two factor, row four of the Account card. Off: a status
// line and Turn on. Turn on runs four steps in place: Confirm password, Scan,
// Enter code, Save codes. On: New backup codes and Turn off, each confirmed
// with the password in the shared Dialog. Explicit submit (D11).

export const TWO_FACTOR_ROW = "two-factor";

const STEPS = ["Confirm password", "Scan", "Enter code", "Save codes"];
const WRONG_PASSWORD = "That password is not right.";
const WRONG_CODE = "That code did not match. Use the newest code in your app.";

type AuthError = { code?: string; status?: number; message?: string } | null | undefined;

function isWrongPassword(error: AuthError) {
  return error?.code === "INVALID_PASSWORD";
}

/* -------------------------------------------------------------------------- */
/* Unsaved codes                                                               */
/* -------------------------------------------------------------------------- */

// 021 I03: after a verified code two factor is on, and the codes stay in
// memory for the session until the person confirms they saved them. Leaving
// Account or collapsing the row keeps them here; nothing is written to storage.
let pendingCodes: string[] | null = null;
const listeners = new Set<() => void>();

function setPendingCodes(codes: string[] | null) {
  pendingCodes = codes;
  listeners.forEach(listener => listener());
}

function usePendingCodes() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pendingCodes
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** The base32 secret from an otpauth URI, in groups of four (021 I05). */
function secretFrom(uri: string) {
  try {
    const secret = new URL(uri).searchParams.get("secret") ?? "";
    return secret.toUpperCase();
  } catch {
    return "";
  }
}

function grouped(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(pointer: coarse)");
    if (!query) return;
    setCoarse(query.matches);
    const update = () => setCoarse(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return coarse;
}

function Spinner() {
  return <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />;
}

function StatusLine({ on }: { on: boolean }) {
  return (
    <p className="text-prism-body text-prism-ink">
      {on
        ? "Two factor is on. You enter a code from your authenticator app when you sign in."
        : "Two factor is off. Add a code from an authenticator app when you sign in."}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Save codes (step 4, and after New backup codes)                            */
/* -------------------------------------------------------------------------- */

function SaveCodes({
  codes,
  requireConfirm,
  onDone,
}: {
  codes: string[];
  requireConfirm: boolean;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="space-y-[21px]">
      <h4
        ref={headingRef}
        tabIndex={-1}
        className="text-prism-label font-semibold text-prism-ink outline-none"
      >
        Save your backup codes
      </h4>
      <p className="-mt-[13px] text-prism-meta text-prism-ink-2">
        Use a backup code to sign in if you lose your authenticator app.
      </p>
      <BackupCodesSlab codes={codes} />
      {requireConfirm && (
        <Checkbox checked={saved} onCheckedChange={setSaved} required>
          I saved these codes
        </Checkbox>
      )}
      <Footer>
        <Button
          type="button"
          size="lg"
          disabled={requireConfirm && !saved}
          onClick={onDone}
          className="min-w-[160px] max-sm:w-full"
        >
          Done
        </Button>
      </Footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Setup (steps 1 to 4)                                                        */
/* -------------------------------------------------------------------------- */

function Setup({ onCancel, onFinished }: { onCancel: () => void; onFinished: () => void }) {
  const { updateAuthUser, refreshUserData } = useAuth();
  const coarse = useCoarsePointer();
  const [step, setStep] = useState(0);

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const [checking, setChecking] = useState(false);

  const [totpUri, setTotpUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const scanHeadingRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Focus follows the step
  useEffect(() => {
    if (step === 0) passwordRef.current?.focus();
    if (step === 1) scanHeadingRef.current?.focus();
    if (step === 2) codeRef.current?.focus();
  }, [step]);

  const start = async () => {
    if (!password || checking) {
      if (!password) setPasswordError(WRONG_PASSWORD);
      return;
    }
    setChecking(true);
    setPasswordError(null);
    setStartFailed(false);
    try {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error) {
        if (isWrongPassword(error)) setPasswordError(WRONG_PASSWORD);
        else setStartFailed(true);
        return;
      }
      // 021 I14: Better Auth returns a union; only the TOTP variant carries the
      // URI. Keep the password, show Retry, and log the shape.
      if (!data || !("totpURI" in data) || !data.totpURI) {
        console.error("Two factor enable returned no totpURI", data && Object.keys(data));
        setStartFailed(true);
        return;
      }
      setTotpUri(data.totpURI);
      setCodes(data.backupCodes ?? []);
      setPassword("");
      setStep(1);
    } catch {
      setStartFailed(true);
    } finally {
      setChecking(false);
    }
  };

  const verify = async (value: string = code) => {
    if (value.length !== 6 || verifying) return;
    setVerifying(true);
    setCodeError(null);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: value });
      if (error) {
        setCodeError(
          error.code === "INVALID_CODE" || error.status === 401 || error.status === 400
            ? WRONG_CODE
            : "The code did not verify. Check your connection and try again."
        );
        setCode("");
        codeRef.current?.focus();
        return;
      }
      // 021 I03: on at once, codes held until the person confirms
      updateAuthUser({ twoFactorEnabled: true });
      setPendingCodes(codes);
      void refreshUserData();
      setStep(3);
    } catch {
      setCodeError("The code did not verify. Check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  };

  const secret = secretFrom(totpUri);

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.add({ type: "success", title: "Secret copied" });
    } catch {
      toast.add({ type: "error", title: "The secret did not copy. Select it and copy it." });
    }
  };

  const cancel = (
    <Button type="button" variant="secondary" onClick={onCancel} className="max-sm:w-full">
      Cancel
    </Button>
  );

  return (
    <div className="space-y-[21px]">
      <StepBar steps={STEPS} current={step} />

      {step === 0 && (
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault();
            void start();
          }}
          className="space-y-[21px]"
        >
          <PasswordField
            ref={passwordRef}
            id="two-factor-password"
            value={password}
            onChange={value => {
              setPassword(value);
              setPasswordError(null);
            }}
            error={passwordError}
          />
          <div className="space-y-2">
            <Footer>
              {cancel}
              <Button
                type="submit"
                size="lg"
                disabled={checking}
                aria-busy={checking}
                className="min-w-[160px] max-sm:w-full"
              >
                {checking && <Spinner />}
                {checking ? "Checking" : "Continue"}
              </Button>
            </Footer>
            {startFailed && (
              <div className="sm:flex sm:justify-end">
                <FieldError id="two-factor-start">Two factor did not start. Retry.</FieldError>
              </div>
            )}
          </div>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-[21px]">
          <h4
            ref={scanHeadingRef}
            tabIndex={-1}
            className="text-prism-label font-semibold text-prism-ink outline-none"
          >
            Scan this code with your authenticator app
          </h4>
          <div className="flex flex-col items-center gap-[13px] sm:flex-row sm:items-start sm:gap-[21px]">
            <div className="rounded-prism-13 bg-white p-[13px] shadow-prism-e1">
              <QRCodeSVG value={totpUri} size={144} aria-label="Two factor setup code" />
            </div>
            <div className="min-w-0 space-y-2 text-center sm:text-left">
              <p className="text-prism-meta text-prism-ink-2">Or enter this key by hand</p>
              <div className="flex items-center justify-center gap-1 sm:justify-start">
                <code className="break-all font-mono text-prism-label font-semibold tabular-nums text-prism-ink">
                  {grouped(secret)}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void copySecret()}
                  aria-label="Copy key"
                >
                  <Copy aria-hidden />
                </Button>
              </div>
              {coarse && (
                <Button asChild variant="secondary" className="max-sm:w-full">
                  <a href={totpUri}>Open in authenticator app</a>
                </Button>
              )}
            </div>
          </div>
          <Footer>
            {cancel}
            <Button
              type="button"
              size="lg"
              onClick={() => setStep(2)}
              className="min-w-[160px] max-sm:w-full"
            >
              Next
            </Button>
          </Footer>
        </div>
      )}

      {step === 2 && (
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault();
            void verify();
          }}
          className="space-y-[21px]"
        >
          <div className="space-y-2">
            <p id="totp-label" className="text-prism-label font-semibold text-prism-ink">
              Enter the six digit code from your app
            </p>
            <OTPInput
              ref={codeRef}
              maxLength={6}
              value={code}
              onChange={value => {
                setCode(value.replace(/\D/g, ""));
                setCodeError(null);
              }}
              // 021 I04: the sixth digit verifies; a pasted code fills every slot
              onComplete={value => void verify(value)}
              pattern="^[0-9]*$"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-labelledby="totp-label"
              aria-describedby={codeError ? "totp-error" : undefined}
              containerClassName="flex items-center gap-2"
            >
              {[0, 1, 2, 3, 4, 5].map(index => (
                <CodeSlot key={index} index={index} invalid={!!codeError} disabled={false} />
              ))}
            </OTPInput>
            {codeError && <FieldError id="totp-error">{codeError}</FieldError>}
          </div>
          <Footer>
            {cancel}
            <Button
              type="submit"
              size="lg"
              disabled={code.length !== 6 || verifying}
              aria-busy={verifying}
              className="min-w-[160px] max-sm:w-full"
            >
              {verifying && <Spinner />}
              {verifying ? "Verifying" : "Verify"}
            </Button>
          </Footer>
        </form>
      )}

      {step === 3 && (
        <SaveCodes
          codes={codes}
          requireConfirm
          onDone={() => {
            setPendingCodes(null);
            toast.add({ type: "success", title: "Two factor is on" });
            onFinished();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Password dialogs (I08 New backup codes, I09 Turn off)                      */
/* -------------------------------------------------------------------------- */

function PasswordDialog({
  open,
  onOpenChange,
  title,
  body,
  action,
  busyLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  action: string;
  busyLabel: string;
  destructive?: boolean;
  /** Resolves to an error line, or null on success */
  onConfirm: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (busy) return;
    if (!password) {
      setError(WRONG_PASSWORD);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const failure = await onConfirm(password);
      if (failure) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-[21px]"
        >
          <PasswordField
            id={`${action.toLowerCase().replace(/\s+/g, "-")}-password`}
            value={password}
            onChange={value => {
              setPassword(value);
              setError(null);
            }}
            error={error}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="max-sm:w-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
              aria-busy={busy}
              className="min-w-[160px] max-sm:w-full"
            >
              {busy && <Spinner />}
              {busy ? busyLabel : action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                         */
/* -------------------------------------------------------------------------- */

function TwoFactorContent() {
  const { authUser, updateAuthUser, refreshUserData } = useAuth();
  const { setOpen } = useDisclosureGroup();
  const enabled = !!authUser?.twoFactorEnabled;
  const pending = usePendingCodes();

  const [settingUp, setSettingUp] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<"codes" | "off" | null>(null);

  const createCodes = async (password: string) => {
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    if (error) {
      return isWrongPassword(error)
        ? WRONG_PASSWORD
        : "New codes were not created. Check your connection and try again.";
    }
    // New codes replace any unsaved setup codes
    setPendingCodes(null);
    setShowPending(false);
    setNewCodes(data?.backupCodes ?? []);
    setDialog(null);
    return null;
  };

  const turnOff = async (password: string) => {
    const { error } = await authClient.twoFactor.disable({ password });
    if (error) {
      return isWrongPassword(error)
        ? WRONG_PASSWORD
        : "Two factor did not turn off. Check your connection and try again.";
    }
    updateAuthUser({ twoFactorEnabled: false });
    setPendingCodes(null);
    setNewCodes(null);
    setDialog(null);
    void refreshUserData();
    toast.add({ type: "success", title: "Two factor is off" });
    setOpen(null);
    return null;
  };

  if (settingUp) {
    return <Setup onCancel={() => setSettingUp(false)} onFinished={() => setSettingUp(false)} />;
  }

  if (!enabled) {
    return (
      <div className="space-y-[21px]">
        <StatusLine on={false} />
        <Button
          type="button"
          size="lg"
          onClick={() => setSettingUp(true)}
          className="min-w-[160px] max-sm:w-full"
        >
          Turn on
        </Button>
      </div>
    );
  }

  if (newCodes) {
    return <SaveCodes codes={newCodes} requireConfirm={false} onDone={() => setNewCodes(null)} />;
  }

  if (pending && showPending) {
    return (
      <SaveCodes
        codes={pending}
        requireConfirm
        onDone={() => {
          setPendingCodes(null);
          setShowPending(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-[21px]">
      <StatusLine on />
      {pending && (
        <Notice variant="warning" title="Save your backup codes">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowPending(true)}
            className="-ml-3"
          >
            Show codes
          </Button>
        </Notice>
      )}
      <div className="flex flex-col gap-[13px] sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDialog("codes")}
          className="max-sm:w-full"
        >
          New backup codes
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDialog("off")}
          className="max-sm:w-full"
        >
          Turn off two factor
        </Button>
      </div>

      <PasswordDialog
        open={dialog === "codes"}
        onOpenChange={open => setDialog(open ? "codes" : null)}
        title="New backup codes"
        body="Your current codes stop working."
        action="Create codes"
        busyLabel="Creating"
        onConfirm={createCodes}
      />
      <PasswordDialog
        open={dialog === "off"}
        onOpenChange={open => setDialog(open ? "off" : null)}
        title="Turn off two factor?"
        body="You will sign in with your password only."
        action="Turn off"
        busyLabel="Turning off"
        destructive
        onConfirm={turnOff}
      />
    </div>
  );
}

export function TwoFactorRow() {
  const { authUser } = useAuth();
  const pending = usePendingCodes();
  const enabled = !!authUser?.twoFactorEnabled;
  return (
    <DisclosureRow
      id={TWO_FACTOR_ROW}
      label="Two factor"
      warning={enabled && !!pending}
      value={
        enabled ? (
          <span className="flex items-center gap-1 font-semibold text-prism-success">
            <Check aria-hidden className="h-[21px] w-[21px]" />
            On
          </span>
        ) : (
          "Off"
        )
      }
    >
      <TwoFactorContent />
    </DisclosureRow>
  );
}

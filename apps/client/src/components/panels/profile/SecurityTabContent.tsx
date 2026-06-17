import { useState, useMemo } from "react";
import { Shield, ShieldCheck, AlertCircle, Loader2, Eye } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BackupCodesDialog } from "@/components/dialogs/BackupCodesDialog";
import { toast } from "sonner";
import { twoFactorPasswordSchema, totpCodeSchema } from "@/schemas";

type SetupStep = "idle" | "confirm-password" | "setup" | "enabled";

export function SecurityTabContent() {
  const { authUser, refreshUserData } = useAuth();
  const [step, setStep] = useState<SetupStep>(
    authUser?.twoFactorEnabled ? "enabled" : "idle"
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  // Setup state
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | undefined>();
  const [showSetupCodes, setShowSetupCodes] = useState(false);

  // Enabled state
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | undefined>();
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const [regenerateError, setRegenerateError] = useState<string | undefined>();
  const [showBackupCodesDialog, setShowBackupCodesDialog] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);



  const isPasswordValid = useMemo(
    () => twoFactorPasswordSchema.safeParse(password).success,
    [password]
  );
  const isTotpValid = useMemo(
    () => totpCodeSchema.safeParse(verifyCode).success,
    [verifyCode]
  );
  const isDisablePasswordValid = useMemo(
    () => twoFactorPasswordSchema.safeParse(disablePassword).success,
    [disablePassword]
  );
  const isRegeneratePasswordValid = useMemo(
    () => twoFactorPasswordSchema.safeParse(regeneratePassword).success,
    [regeneratePassword]
  );

  const handleInitiateEnable = async () => {
    setLoading(true);
    setPasswordError(undefined);
    try {
      const { data: result, error: enableError } = await authClient.twoFactor.enable({
        password,
      });
      if (enableError) throw new Error(enableError.message || "Failed to enable 2FA");
      setTotpUri(result.totpURI);
      setSetupBackupCodes(result.backupCodes);
      setStep("setup");
      setPassword("");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to enable 2FA. Check your password.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async () => {
    const parsed = totpCodeSchema.safeParse(verifyCode);
    if (!parsed.success) {
      setVerifyError(parsed.error.issues[0]?.message ?? "Invalid TOTP code");
      return;
    }
    setLoading(true);
    setVerifyError(undefined);
    try {
      const { error: verifyTotpError } = await authClient.twoFactor.verifyTotp({
        code: verifyCode,
      });
      if (verifyTotpError) throw new Error(verifyTotpError.message || "Invalid code");
      await refreshUserData();
      setShowSetupCodes(true);
    } catch (err: any) {
      setVerifyError(err.message || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = () => {
    toast.success("Two-factor authentication enabled");
    setStep("enabled");
    setShowSetupCodes(false);
  };

  const handleDisable = async () => {
    setLoading(true);
    setDisableError(undefined);
    try {
      const { error: disableError_ } = await authClient.twoFactor.disable({
        password: disablePassword,
      });
      if (disableError_) throw new Error(disableError_.message || "Failed to disable 2FA");
      await refreshUserData();
      toast.success("Two-factor authentication disabled");
      setShowDisableDialog(false);
      setDisablePassword("");
      setStep("idle");
      setTotpUri(null);
      setSetupBackupCodes([]);
    } catch (err: any) {
      setDisableError(err.message || "Failed to disable 2FA. Check your password.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBackupCodes = async () => {
    setLoading(true);
    setRegenerateError(undefined);
    try {
      const { data: result, error: genError } = await authClient.twoFactor.generateBackupCodes({
        password: regeneratePassword,
      });
      if (genError) throw new Error(genError.message || "Failed to generate backup codes");
      setBackupCodes(result.backupCodes);
      setShowRegenerateDialog(false);
      setRegeneratePassword("");
      setShowBackupCodesDialog(true);
    } catch (err: any) {
      setRegenerateError(err.message || "Failed to generate backup codes");
    } finally {
      setLoading(false);
    }
  };



  // State: 2FA Disabled (Idle)
  if (step === "idle") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Security</h2>
          <p className="text-sm text-gray-500">Manage your account security settings</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
              <p className="text-sm text-gray-500 mt-1">
                Add an extra layer of security to your account by requiring a code
                from your authenticator app when signing in.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Input
              label="Enter your password to continue"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(undefined);
              }}
              error={passwordError}
              autoComplete="current-password"
            />

            <Button
              onClick={handleInitiateEnable}
              disabled={loading || !isPasswordValid}
              className="w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enabling...
                </span>
              ) : (
                "Enable Two-Factor Authentication"
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // State: Setup In Progress
  if (step === "setup") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Set Up Two-Factor Authentication</h2>
          <p className="text-sm text-gray-500">
            Scan the QR code with your authenticator app, then enter the 6-digit code to verify.
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Step 1: Scan QR Code</h3>
            {totpUri && (
              <div className="flex justify-center p-4 bg-white rounded-lg border border-gray-200">
                <QRCodeSVG value={totpUri} size={180} />
              </div>
            )}
            {totpUri && (
              <p className="text-xs text-gray-500 text-center break-all">
                Or enter manually: {totpUri}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Step 2: Verify Code</h3>

            {verifyError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-600">{verifyError}</p>
              </div>
            )}

            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={verifyCode}
                onChange={(value) => {
                  setVerifyCode(value);
                  setVerifyError(undefined);
                }}
                onComplete={handleVerifySetup}
                disabled={loading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("idle");
                  setTotpUri(null);
                  setSetupBackupCodes([]);
                  setPassword("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleVerifySetup}
                disabled={loading || !isTotpValid}
                className="flex-1"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  "Verify & Enable"
                )}
              </Button>
            </div>
          </div>
        </div>

        {setupBackupCodes.length > 0 && !showSetupCodes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <button
              type="button"
              onClick={() => setShowSetupCodes(true)}
              className="text-sm text-amber-800 hover:text-amber-900 font-medium flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View your backup codes (save them before completing setup)
            </button>
          </div>
        )}

        {showSetupCodes && (
          <BackupCodesDialog
            isOpen={showSetupCodes}
            onClose={() => setShowSetupCodes(false)}
            backupCodes={setupBackupCodes}
            onSaved={handleSetupComplete}
          />
        )}
      </div>
    );
  }

  // State: 2FA Enabled
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Security</h2>
        <p className="text-sm text-gray-500">Manage your account security settings</p>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Enabled
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Your account is protected with TOTP two-factor authentication.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setRegeneratePassword("");
              setRegenerateError(undefined);
              setShowRegenerateDialog(true);
            }}
            className="flex-1 min-w-[150px]"
          >
            <Shield className="w-4 h-4 mr-2" />
            Regenerate Backup Codes
          </Button>
        </div>

        <div className="pt-2 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={() => setShowDisableDialog(true)}
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            Disable Two-Factor Authentication
          </Button>
        </div>
      </div>

      {/* Disable Confirmation Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication?</DialogTitle>
            <DialogDescription>
              This will remove an important security layer from your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {disableError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-600">{disableError}</p>
              </div>
            )}

            <Input
              label="Enter your password to confirm"
              type="password"
              value={disablePassword}
              onChange={(e) => {
                setDisablePassword(e.target.value);
                setDisableError(undefined);
              }}
              autoComplete="current-password"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisableDialog(false);
                  setDisablePassword("");
                  setDisableError(undefined);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDisable}
                disabled={loading || !isDisablePasswordValid}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disabling...
                  </span>
                ) : (
                  "Confirm Disable"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Regenerate Backup Codes Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate Backup Codes</DialogTitle>
            <DialogDescription>
              This will invalidate all your existing backup codes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {regenerateError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-600">{regenerateError}</p>
              </div>
            )}

            <Input
              label="Enter your password to confirm"
              type="password"
              value={regeneratePassword}
              onChange={(e) => {
                setRegeneratePassword(e.target.value);
                setRegenerateError(undefined);
              }}
              autoComplete="current-password"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRegenerateDialog(false);
                  setRegeneratePassword("");
                  setRegenerateError(undefined);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerateBackupCodes}
                disabled={loading || !isRegeneratePasswordValid}
                className="flex-1"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  "Regenerate Codes"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      {showBackupCodesDialog && (
        <BackupCodesDialog
          isOpen={showBackupCodesDialog}
          onClose={() => setShowBackupCodesDialog(false)}
          backupCodes={backupCodes}
        />
      )}
    </div>
  );
}

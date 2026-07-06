import { useState } from "react";
import { useNavigate } from "react-router";
import { Shield, AlertCircle, Loader2, KeyRound, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import AMPLIFY_FULL_K from "@/assets/AMPLIFY_FULL_K.svg";

export function TwoFactorChallenge() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);

  const handleVerifyTotp = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: verifyError } = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice,
      });
      if (verifyError) {
        setError(verifyError.message || "Invalid code. Please try again.");
        return;
      }
      if (data) {
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError((err as Error).message || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBackupCode = async () => {
    if (!backupCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: verifyError } = await authClient.twoFactor.verifyBackupCode({
        code: backupCode.trim(),
        trustDevice,
      });
      if (verifyError) {
        setError(verifyError.message || "Invalid backup code. Please try again.");
        return;
      }
      if (data) {
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError((err as Error).message || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await authClient.signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8">
        <img src={AMPLIFY_FULL_K} alt="Amped Bio" className="h-8" />
      </div>

      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
            {useBackupCode ? (
              <KeyRound className="w-6 h-6 text-blue-600" />
            ) : (
              <Shield className="w-6 h-6 text-blue-600" />
            )}
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            {useBackupCode ? "Use Backup Code" : "Two-Factor Authentication"}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {useBackupCode
              ? "Enter one of your backup codes to sign in."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {useBackupCode ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Backup Code
              </label>
              <input
                type="text"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                placeholder="XXXX-XXXX"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={9}
                autoFocus
              />
            </div>
            <Button
              onClick={handleVerifyBackupCode}
              disabled={loading || !backupCode.trim()}
              className="w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify Backup Code"
              )}
            </Button>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Trust this device for 30 days</span>
            </label>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(value) => setCode(value)}
                onComplete={handleVerifyTotp}
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

            <Button
              onClick={handleVerifyTotp}
              disabled={loading || code.length !== 6}
              className="w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify"
              )}
            </Button>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Trust this device for 30 days</span>
            </label>
          </div>
        )}

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setError(null);
              setCode("");
              setBackupCode("");
            }}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {useBackupCode
              ? "Use authenticator app instead"
              : "Use backup code instead"}
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
            className="w-full text-gray-500 hover:text-gray-700 border-gray-200"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cancel and return to home
          </Button>
        </div>
      </div>
    </div>
  );
}

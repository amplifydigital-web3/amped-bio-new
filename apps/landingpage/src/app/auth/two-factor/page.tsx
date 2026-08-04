"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, AlertCircle, Loader2, KeyRound, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@repo/ui";
import { Button } from "@repo/ui";
import { Input } from "@repo/ui";

export default function TwoFactorChallengePage() {
  const router = useRouter();
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
        router.push("/");
        router.refresh();
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
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await authClient.signOut();
    router.push("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8">
        <span className="text-xl font-bold text-primary">Amped Bio</span>
      </div>

      <Card className="w-full max-w-md p-8">
        <CardContent className="space-y-6">
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
              <Input
                type="text"
                value={backupCode}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 11);
                  setBackupCode(cleaned);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text");
                  const cleaned = pasted.replace(/^[^a-zA-Z0-9]*\d+\.\s*/, "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 11);
                  setBackupCode(cleaned);
                }}
                placeholder="XXXXX-XXXXX"
                className="text-center text-lg tracking-widest"
                autoFocus
              />
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
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(val);
                    if (val.length === 6) {
                      setTimeout(() => handleVerifyTotp(), 0);
                    }
                  }}
                  className="w-48 text-center text-2xl tracking-[0.5em]"
                  placeholder="000000"
                  disabled={loading}
                />
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
              {useBackupCode ? "Use authenticator app instead" : "Use backup code instead"}
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
        </CardContent>
      </Card>
    </div>
  );
}

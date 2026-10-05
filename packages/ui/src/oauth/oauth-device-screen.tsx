"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "../auth-client";
import { Button } from "../button";
import { Input } from "../input";
import { Label } from "../label";

/**
 * Hosted device-flow verification page (RFC 8628): the user types the code
 * shown by the CLI or limited-input client and approves it.
 */
export function OAuthDeviceScreen() {
  const [userCode, setUserCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const code = userCode.trim();
    if (!code) {
      setError("Enter the code shown on your device.");
      return;
    }

    setLoading(true);
    try {
      const response = await authClient.device.approve({ userCode: code });

      if (response?.error) {
        const approvalError = response.error as { message?: string; error_description?: string };
        setError(approvalError.message || approvalError.error_description || "That code is invalid or expired.");
        return;
      }

      setApproved(true);
    } catch (approveError) {
      setError((approveError as Error).message || "That code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  if (approved) {
    return (
      <p className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
        Device approved. You can close this window and return to your device.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="oauth-device-code">Device code</Label>
        <Input
          id="oauth-device-code"
          value={userCode}
          onChange={event => setUserCode(event.target.value)}
          placeholder="XXXX-XXXX"
          autoComplete="off"
          disabled={loading}
        />
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Approve device"}
      </Button>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { authClient } from "../auth-client";
import { Button } from "../button";
import { Input } from "../input";
import { Label } from "../label";
import { navigateToProviderRedirect } from "./use-oauth-flow-query";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

interface OAuthLoginScreenProps {
  /** Name shown to the user for the application that started the flow. */
  appName?: string;
  /** Rendered only when the deployment has a Google client id configured. */
  googleEnabled?: boolean;
  /** Proof-of-work captcha provider of the host application. */
  getCaptchaToken?: () => Promise<string | null>;
  /** Called when the flow completes without a provider redirect. */
  onSignedIn?: () => void;
}

export function OAuthLoginScreen({
  appName,
  googleEnabled = false,
  getCaptchaToken,
  onSignedIn,
}: OAuthLoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captchaHeaders = async () => {
    if (!getCaptchaToken) return undefined;
    const token = await getCaptchaToken();
    return token ? { "x-captcha-response": token } : undefined;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid credentials");
      return;
    }

    setLoading(true);
    try {
      const headers = await captchaHeaders();
      const response = await authClient.signIn.email(
        { email: parsed.data.email, password: parsed.data.password },
        {
          headers,
          onError: context => {
            setError(context.error.message || "Unable to sign in");
          },
        }
      );

      if (response?.error) {
        setError(response.error.message || "Unable to sign in");
        return;
      }

      if (!navigateToProviderRedirect(response?.data)) onSignedIn?.();
    } catch (signInError) {
      setError((signInError as Error).message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL:
          typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`,
      });

      if (response?.error) {
        setError(response.error.message || "Google sign in failed");
        return;
      }

      if (!navigateToProviderRedirect(response?.data)) onSignedIn?.();
    } catch (socialError) {
      setError((socialError as Error).message || "Google sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {appName ? (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-center text-sm text-gray-600">
          Sign in to continue to <span className="font-medium text-gray-900">{appName}</span>
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="oauth-email">Email</Label>
          <Input
            id="oauth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="oauth-password">Password</Label>
          <Input
            id="oauth-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            disabled={loading}
            required
          />
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Continue"}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-gray-200" />
            <span className="mx-4 flex-shrink text-xs uppercase tracking-wide text-gray-500">or</span>
            <div className="flex-grow border-t border-gray-200" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            Continue with Google
          </Button>
        </>
      ) : null}
    </div>
  );
}

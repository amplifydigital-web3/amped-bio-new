"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@ampedbio/ui";
import { Button } from "@ampedbio/ui";
import { Input } from "@ampedbio/ui";

function ResendVerificationForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleResend = async () => {
    if (!email) return;
    setStatus("loading");
    setMessage("");

    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/auth/verify-email`,
      });

      if (error) {
        setStatus("error");
        setMessage(error.message || "Failed to send verification email");
      } else {
        setStatus("success");
        setMessage("Verification email sent! Please check your inbox.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <Card className="w-full max-w-md p-8">
      <CardContent className="space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-gray-800">Resend Verification Email</h1>
          <p className="text-sm text-gray-500">
            Enter your email to receive a new verification link.
          </p>
        </div>

        <div className="space-y-4">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <Button
            onClick={handleResend}
            disabled={!email || status === "loading"}
            className="w-full"
          >
            {status === "loading" ? (
              <span className="flex items-center justify-center">
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </span>
            ) : (
              "Send Verification Email"
            )}
          </Button>
        </div>

        {status === "success" && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{message}</p>
          </div>
        )}

        <div className="text-center">
          <Link href="/" className="text-sm text-primary hover:underline">
            Back to Home
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ResendVerificationPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Suspense fallback={<div className="animate-pulse text-gray-400">Loading...</div>}>
        <ResendVerificationForm />
      </Suspense>
    </div>
  );
}

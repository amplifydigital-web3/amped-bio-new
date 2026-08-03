"use client";

import { useEffect, useState } from "react";
import { use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@ampedbio/ui";

function EmailVerificationForm({ token: initialToken }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [handle, setHandle] = useState("");

  const email = searchParams.get("email") || "";
  const statusParam = searchParams.get("status");
  const errorParam = searchParams.get("error");

  useEffect(() => {
    if (statusParam === "success") {
      setStatus("success");
      const handleParam = searchParams.get("handle");
      if (handleParam) setHandle(handleParam);
      return;
    }

    if (errorParam) {
      setStatus("error");
      setMessage(
        errorParam === "invalidToken"
          ? "(Token, Email) not found"
          : errorParam === "emailMissing"
            ? "Email address is missing"
            : "Verification failed"
      );
      return;
    }

    if (!initialToken || !email) {
      setStatus("error");
      setMessage("Missing token or email");
      return;
    }

    authClient
      .verifyEmail({
        query: { token: initialToken, callbackURL: "/" },
      })
      .then(response => {
        if (response.data?.status) {
          setStatus("success");
          authClient.getSession().then(sessionResponse => {
            const user = sessionResponse.data?.user as { handle?: string } | null;
            if (user?.handle) setHandle(user.handle);
          });
        } else {
          setStatus("error");
          setMessage(response.error?.message || "Verification failed");
        }
      })
      .catch(error => {
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "An error occurred during verification"
        );
      });
  }, [initialToken, email, statusParam, errorParam, searchParams, router]);

  return (
    <Card className="w-full max-w-md p-8">
      <CardContent className="space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-gray-800">Email Verification</h1>
        </div>

        {status === "loading" && (
          <div className="text-center space-y-3">
            <Loader className="animate-spin h-10 w-10 mx-auto text-primary" />
            <p className="text-gray-600">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Email Verified Successfully!</h2>
            <p className="text-gray-600">Your email has been verified.</p>
            {handle ? (
              <Link
                href={`/${handle}`}
                className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors"
              >
                Go to Your Profile
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors"
              >
                Go to Home
              </Link>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Verification Failed</h2>
            <p className="text-gray-600">
              {message || "There was a problem verifying your email."}
            </p>
            <Link
              href={`/auth/resend-verification?email=${encodeURIComponent(email)}`}
              className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors"
            >
              Resend Verification Email
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EmailVerificationPage({
  params,
}: {
  params: Promise<{ token?: string[] }>;
}) {
  const { token: tokenArray } = use(params);
  const token = tokenArray?.[0] || "";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Suspense fallback={<div className="animate-pulse text-gray-400">Loading...</div>}>
        <EmailVerificationForm token={token} />
      </Suspense>
    </div>
  );
}

"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card, CardContent } from "@ampedbio/ui";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        router.push(redirectTo);
      } else {
        setLoading(false);
      }
    });
  }, [router, redirectTo]);

  if (loading) {
    return <div className="animate-pulse text-gray-400">Loading...</div>;
  }

  return (
    <Card className="w-full max-w-md p-8">
      <CardContent className="space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-500">
            Registration is handled through our secure authentication system.
          </p>
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_PANEL_URL || ""}/register`}
          className="block w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Open Registration
        </a>
        <p className="text-xs text-gray-400">
          You will be redirected to the app to complete registration.
        </p>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-grow flex items-center justify-center bg-gray-50 px-4">
        <Suspense fallback={<div className="animate-pulse text-gray-400">Loading...</div>}>
          <RegisterForm />
        </Suspense>
      </main>
    </div>
  );
}

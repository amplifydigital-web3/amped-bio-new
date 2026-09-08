"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/contexts/AuthContext";
import { formatHandle } from "@/lib/handle";

function AuthPageContent({ initialForm }: { initialForm: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authUser, isPending } = useAuth();
  const [ready, setReady] = useState(false);

  const redirectTo = searchParams.get("redirect") || "/";

  useEffect(() => {
    if (!isPending && authUser) {
      if (authUser.handle) {
        router.push(
          `${process.env.NEXT_PUBLIC_PANEL_URL || ""}/${formatHandle(authUser.handle)}/edit`
        );
      } else {
        router.push(redirectTo);
      }
    } else if (!isPending) {
      setReady(true);
    }
  }, [isPending, authUser, router, redirectTo]);

  if (!ready) {
    return <div className="animate-pulse text-gray-400 py-16">Loading...</div>;
  }

  return (
    <main className="flex-grow flex items-center justify-center bg-gray-50 px-4 py-10">
      <AuthModal
        isOpen={true}
        initialForm={initialForm}
        onClose={user => {
          if (user.handle) {
            router.push(
              `${process.env.NEXT_PUBLIC_PANEL_URL || ""}/${formatHandle(user.handle)}/edit`
            );
          } else {
            router.push(redirectTo);
          }
        }}
        onCancel={() => router.push("/")}
      />
    </main>
  );
}

export function AuthPage({ initialForm }: { initialForm: "login" | "register" }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <Suspense fallback={<div className="animate-pulse text-gray-400 py-16">Loading...</div>}>
        <AuthPageContent initialForm={initialForm} />
      </Suspense>
    </div>
  );
}

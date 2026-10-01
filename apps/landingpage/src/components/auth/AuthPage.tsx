"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCardSkeleton } from "@repo/ui";
import { useAuth } from "@/contexts/AuthContext";
import { getPostAuthDestination, goTo } from "@/lib/panel";
import { AuthLayout } from "./AuthLayout";
import { SignInForm } from "./SignInForm";
import { RegisterForm } from "./RegisterForm";

function useDelayed(active: boolean, ms: number) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return setShown(false);
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

function AuthPageContent({ initialForm }: { initialForm: "login" | "register" }) {
  const params = useSearchParams();
  const { authUser, isPending } = useAuth();
  const signedIn = !isPending && !!authUser;
  const showSkeleton = useDelayed(isPending || signedIn, 400);

  // A signed in visitor goes straight to the editor (or a safe returnTo)
  useEffect(() => {
    if (signedIn) goTo(getPostAuthDestination(params));
  }, [signedIn, params]);

  if (isPending || signedIn) return showSkeleton ? <AuthCardSkeleton /> : null;
  return initialForm === "register" ? <RegisterForm /> : <SignInForm />;
}

export function AuthPage({ initialForm }: { initialForm: "login" | "register" }) {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <AuthPageContent initialForm={initialForm} />
      </Suspense>
    </AuthLayout>
  );
}

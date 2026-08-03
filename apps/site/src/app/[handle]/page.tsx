"use client";

import { use } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { ProfileView } from "@/components/ProfileView";

export default function HandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-grow">
        <ProfileView handle={handle} />
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";

export function PublicHeader() {
  const pathname = usePathname();
  const isStandaloneAuthPage = pathname.startsWith("/auth/") || pathname === "/sign";

  if (isStandaloneAuthPage) return null;

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm">
      <div className="flex items-center space-x-6">
        <Link href="/" className="flex items-center">
          <span className="text-xl font-bold text-primary">Amped Bio</span>
        </Link>
        <Link href="/i/pools" className="text-sm font-medium text-gray-700 hover:text-gray-900">
          Pools
        </Link>
      </div>
      <div className="flex items-center space-x-4">
        <UserMenu />
      </div>
    </header>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { SystemStatsBadge } from "./SystemStatsBadge";

export function PublicHeader() {
  const pathname = usePathname();
  const isStandaloneAuthPage = pathname.startsWith("/auth/") || pathname === "/sign";
  const isLandingPage = pathname === "/";

  if (isStandaloneAuthPage) return null;

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm">
      <div className="flex items-center space-x-6">
        <Link href="/" className="flex items-center">
          <Image src="/logo.svg" alt="Amplify Logo" width={0} height={0} className="h-8 w-auto" priority />
        </Link>
        <Link href="/i/pools" className="text-sm font-medium text-gray-700 hover:text-gray-900">
          Pools
        </Link>
        <Link href="/blog" className="text-sm font-medium text-gray-700 hover:text-gray-900">
          Blog
        </Link>
      </div>
      <div className="flex items-center space-x-4">
        {isLandingPage && (
          <div className="hidden md:block">
            <SystemStatsBadge />
          </div>
        )}
        <UserMenu />
      </div>
    </header>
  );
}

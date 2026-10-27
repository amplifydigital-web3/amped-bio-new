"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui";
import { UserMenu } from "@/components/auth/UserMenu";

// Routes whose own card is the sign in, so the header hides Sign in (009 I22)
const AUTH_ROUTES = ["/login", "/register", "/oauth", "/auth"];

const LINKS = [
  { href: "/i/pools", label: "Pools", match: "/i/pools" },
  { href: "/i/blog", label: "Blog", match: "/i/blog" },
  // At 390 Developers moves to the footer (D20, 007 I17)
  { href: "/docs", label: "Developers", match: "/docs", desktopOnly: true },
];

// Prism public header (Screen Review 007 I02 to I05, I17; D20): a floating G1
// navigate capsule, r34, 55 high. Logo, Pools, Blog, Developers, then Sign in
// or Open editor with the account menu.
export function PublicHeader() {
  const pathname = usePathname();
  // /sign keeps its own frame until row 074
  const isStandaloneAuthPage = pathname === "/sign";
  const isAuthRoute = AUTH_ROUTES.some(
    route => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isStandaloneAuthPage) return null;

  return (
    <div className="pointer-events-none sticky top-0 z-30 px-[13px] pt-[13px] sm:px-[34px] sm:pt-[21px]">
      <header className="prism-glass-nav pointer-events-auto mx-auto flex h-commit max-w-[1372px] items-center gap-1 rounded-prism-34 pl-[13px] pr-[5px] font-prism text-prism-ink sm:pl-[21px]">
        <Link
          href="/"
          className="prism-focus mr-1 flex h-touch shrink-0 items-center rounded-prism-13 px-1 sm:mr-3"
        >
          <Image
            src="/logo.svg"
            alt="Amped.Bio home"
            width={56}
            height={28}
            className="h-[28px] w-auto"
            priority
          />
        </Link>
        <nav aria-label="Main" className="flex min-w-0 items-center gap-1">
          {LINKS.map(link => {
            const current = pathname === link.match || pathname.startsWith(`${link.match}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "prism-focus h-touch items-center rounded-full px-[13px] text-prism-label font-semibold text-prism-ink",
                  link.desktopOnly ? "hidden sm:inline-flex" : "inline-flex",
                  current
                    ? "prism-lens-thumb"
                    : "transition-colors duration-prism-hover ease-prism hover:bg-white/45"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!isAuthRoute && <UserMenu />}
        </div>
      </header>
    </div>
  );
}

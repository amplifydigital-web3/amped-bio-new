import type { ReactNode } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";

// Auth route frame (Screen Review 009 I01, I02): the room, the public header
// with Sign in hidden, the auth card inline (no dialog, no overlay), the public
// footer under it so Developers and the policy links stay reachable at 390.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="prism-room prism-font flex min-h-dvh flex-col text-prism-ink">
      <PublicHeader />
      <main className="flex-1 px-[13px] pb-[55px] pt-[21px] sm:pt-[68px]">{children}</main>
      <div className="px-[13px] sm:px-[34px]">
        <PublicFooter />
      </div>
    </div>
  );
}

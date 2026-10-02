import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";

// Screen Review 071 I06, I15. The pool page sits on the room under the public
// header, with the All pools breadcrumb on every state.
export default function PoolPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="prism-room prism-font flex min-h-dvh flex-col text-prism-ink">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-[13px] pb-[144px] pt-[21px] sm:px-[34px] lg:pb-[55px]">
        <nav aria-label="Breadcrumb" className="mb-[13px]">
          <Link
            href="/i/pools"
            className="prism-btn-ghost prism-focus -ml-3 inline-flex h-touch items-center gap-2 rounded-prism-13 px-3 text-prism-label font-semibold"
          >
            <ArrowLeft className="h-[21px] w-[21px]" aria-hidden />
            All pools
          </Link>
        </nav>
        {children}
      </main>
      <div className="px-[13px] sm:px-[34px]">
        <PublicFooter />
      </div>
    </div>
  );
}

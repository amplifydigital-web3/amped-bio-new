import type { Metadata } from "next";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { HandleNotFoundCard } from "@/components/HandleNotFoundCard";

// Screen Review 039 I04: a handle with no page answers HTTP 404 (notFound() in
// the page) with a claim card on the public site.
export const metadata: Metadata = {
  title: "Page not found | Amped.Bio",
  robots: { index: false, follow: true },
};

export default function HandleNotFound() {
  return (
    <div className="prism-room prism-font flex min-h-dvh flex-col text-prism-ink">
      <PublicHeader />
      <main className="flex flex-1 items-start justify-center px-[13px] pb-[55px] pt-[89px] sm:pt-[144px]">
        <HandleNotFoundCard />
      </main>
      <div className="px-[13px] sm:px-[34px]">
        <PublicFooter />
      </div>
    </div>
  );
}

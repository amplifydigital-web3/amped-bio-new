import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { NoticeStatus } from "@/components/notices/NoticeForms";

export const metadata: Metadata = {
  title: "Notice status | Amped.Bio",
  robots: { index: false, follow: false },
  // The status key is in this URL: never send it to another origin as a Referer
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#16152B]">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[610px] px-4 py-[34px]">
        <h1 className="text-[28px] font-bold leading-[34px]">Notice {number}</h1>
        <div className="mt-[21px]">
          <Suspense>
            <NoticeStatus kind="copyright" number={number} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { TAKEDOWN_COPY as copy } from "@repo/constants";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { TakedownForm } from "@/components/notices/NoticeForms";

// Adult content review 7.2 and 7.5 (PR R3): a public form, no account needed
export const metadata: Metadata = {
  title: "Take It Down | Amped.Bio",
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#16152B]">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[610px] px-4 py-[34px]">
        <h1 className="text-[28px] font-bold leading-[34px]">{copy.formTitle}</h1>
        <p className="mt-[8px] text-[16px] leading-[24px]">{copy.formIntro}</p>
        <div className="mt-[21px]">
          <Suspense>
            <TakedownForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

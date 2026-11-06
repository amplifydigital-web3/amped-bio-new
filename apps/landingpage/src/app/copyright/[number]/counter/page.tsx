import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { CounterForm } from "@/components/notices/NoticeForms";

export const metadata: Metadata = {
  title: "Counter notice | Amped.Bio",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#16152B]">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[610px] px-4 py-[34px]">
        <h1 className="text-[28px] font-bold leading-[34px]">Counter notice on {number}</h1>
        <div className="mt-[21px]">
          <Suspense>
            <CounterForm number={number} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

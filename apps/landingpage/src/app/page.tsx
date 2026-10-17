import type { Metadata } from "next";
import { LayoutTemplate, Wallet } from "lucide-react";
import { Notice, TESTNET_NOTICE } from "@repo/ui";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { NetworkTotals } from "@/components/layout/NetworkTotals";
import { ClaimBar } from "@/components/landing/ClaimBar";
import { DemoPage } from "@/components/landing/DemoPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { SHOW_MOTION } from "@/components/landing/motion/flag";
import { HeroBeam } from "@/components/landing/motion/HeroBeam";
import { HeroHeadline } from "@/components/landing/motion/HeroHeadline";
import { HowItWorks } from "@/components/landing/motion/HowItWorks";
import { PauseMotionButton } from "@/components/landing/motion/PauseMotionButton";
import { SITE_URL, buildSiteJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

// Cache the homepage for 5 minutes; revalidate on demand after that
export const revalidate = 300;

// The 10K Club card renders once its explainer page is published (007 D2)
const TEN_K_CLUB_URL = process.env.NEXT_PUBLIC_TEN_K_CLUB_URL;

const VALUE_CARDS = [
  {
    icon: LayoutTemplate,
    title: "Build your page",
    body: "Links, media, embeds, themes and motion. It lives at amped.bio/you.",
  },
  {
    icon: Wallet,
    title: "Keep a wallet",
    body: "Every page comes with a Revolution Network testnet wallet. Get testnet tREVO from the faucet, then hold, send and receive it.",
  },
];

// Native Prism landing (Screen Review 007, D1): copy lives in code, no creator
// theme, no consent prompt on the front door. Order: header, hero with claim
// bar and demo frame, value cards, testnet notice, network totals, footer.
// With NEXT_PUBLIC_SHOW_MOTION (Build Board #26): the hero light, the headline
// reveal, How it works and Pause motion. Network totals are tREVO figures and
// never move.
export default function HomePage() {
  return (
    <div className="prism-room prism-font flex min-h-dvh flex-col overflow-x-clip text-prism-ink">
      <JsonLd data={buildSiteJsonLd()} />
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1372px] flex-1 px-[13px] sm:px-0">
        <section className="relative isolate grid items-center gap-[34px] pt-[55px] lg:grid-cols-[minmax(0,1fr)_508px] lg:gap-[21px] lg:pt-[68px]">
          {SHOW_MOTION && <HeroBeam />}
          <div className="max-w-[856px]">
            <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
              <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
              Link in bio with a wallet
            </p>
            {SHOW_MOTION ? (
              <HeroHeadline
                text="Claim your page."
                className="mt-[13px] font-prism-display text-prism-display-68 text-prism-ink sm:text-prism-display"
              />
            ) : (
              <h1 className="mt-[13px] font-prism-display text-prism-display-68 text-prism-ink sm:text-prism-display">
                Claim your page.
              </h1>
            )}
            <p className="mt-[21px] max-w-[610px] text-prism-body text-prism-ink-2">
              Amped.Bio is more than a link-in-bio. It&apos;s your passport into the Revolution
              Network. Each profile doubles as your wallet and hub for staking into Reward Pools.
            </p>
            <div className="mt-[34px]">
              <ClaimBar />
            </div>
          </div>
          <div className="prism-glass-clear rounded-prism-34 p-[21px]">
            <DemoPage />
          </div>
        </section>

        {SHOW_MOTION && <HowItWorks />}

        <section aria-label="What you get" className="mt-[89px] space-y-[21px]">
          <div
            className={`grid gap-[21px] ${TEN_K_CLUB_URL ? "md:grid-cols-3" : "md:grid-cols-2"}`}
          >
            {VALUE_CARDS.map(card => (
              <article key={card.title} className="prism-glass-clear p-[21px]">
                <card.icon className="h-[21px] w-[21px] text-prism-value-ink" aria-hidden />
                <h2 className="mt-[13px] text-prism-panel-title text-prism-ink">{card.title}</h2>
                <p className="mt-2 text-prism-body text-prism-ink-2">{card.body}</p>
              </article>
            ))}
            {TEN_K_CLUB_URL && (
              <article className="prism-glass-clear p-[21px]">
                <h2 className="text-prism-panel-title text-prism-ink">The 10K Club</h2>
                <p className="mt-2 text-prism-body text-prism-ink-2">
                  Unlock access to the 10K Club.
                </p>
                <a
                  href={TEN_K_CLUB_URL}
                  className="prism-btn-ghost prism-focus mt-[13px] inline-flex h-touch items-center rounded-prism-13 px-4 text-prism-label font-semibold"
                >
                  What is the 10K Club?
                </a>
              </article>
            )}
          </div>
          <Notice variant="warning" title="Testnet">
            {TESTNET_NOTICE}
          </Notice>
          <NetworkTotals />
        </section>

        {SHOW_MOTION && (
          <div className="mt-[34px] flex justify-end">
            <PauseMotionButton />
          </div>
        )}

        <div className={SHOW_MOTION ? "mt-[21px]" : "mt-[89px]"}>
          <PublicFooter />
        </div>
      </main>
    </div>
  );
}

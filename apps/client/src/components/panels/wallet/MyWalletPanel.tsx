import { lazy, Suspense, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useRnsSubPage } from "./rns/useRnsRoute";
import { RnsSubPage } from "./rns/RnsTab";
import { WalletErrorCard, WalletSummary, useNoWalletTimeout } from "./summary/WalletSummary";

// 062 I01: Send opens in the value panel at ?send=1 (D05, D12)
const SendFlow = lazy(() => import("./send/SendFlow"));
// Screen Review 059: Stakes replaces StakedPoolsSection on the Wallet
const StakesCard = lazy(() => import("./stakes/StakesCard"));
const ProfileTabs = lazy(() => import("./ProfileTabs"));
// Screen Review 060: referral cards live in the Get tREVO section
const InviteCard = lazy(() => import("./referral/InviteCard"));
const RefereeCard = lazy(() => import("./referral/RefereeCard"));
// Screen Review 053: the Testnet faucet card, first in the Get tREVO grid
const FaucetCard = lazy(() => import("./faucet/FaucetCard"));
const LaunchPoolAd = lazy(() => import("./LaunchPoolAd"));

export function MyWalletPanel() {
  // 049 I11: a render error shows the local error card, never a blank panel
  const [attempt, setAttempt] = useState(0);
  return (
    <ErrorBoundary
      key={attempt}
      fallback={
        <div className="h-full overflow-y-auto p-6 max-sm:px-[13px] md:mx-auto md:w-4/5">
          <WalletErrorCard
            title="Wallet did not load"
            onRetry={() => setAttempt(current => current + 1)}
          />
        </div>
      }
    >
      <WalletContent />
    </ErrorBoundary>
  );
}

function WalletContent() {
  const noWallet = useNoWalletTimeout();

  // 100 I07, 111 I01: the address view and the RNS name page replace the
  // Wallet summary and tabs, with a back lens to the RNS tab
  const rnsSubPage = useRnsSubPage();
  if (rnsSubPage) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 pb-[calc(89px+env(safe-area-inset-bottom,0px))] max-sm:px-[13px] sm:pb-6 md:mx-auto md:w-4/5">
          <RnsSubPage />
        </div>
      </div>
    );
  }

  // 049 I11 edge case: no address 10 s after mount replaces the Wallet content
  if (noWallet.timedOut) {
    return (
      <div className="h-full overflow-y-auto p-6 max-sm:px-[13px] md:mx-auto md:w-4/5">
        <WalletErrorCard title="Wallet did not connect" onRetry={noWallet.retry} />
      </div>
    );
  }

  // Connected view (existing wallet interface)
  const loggedInView = (
    <div className="h-full overflow-y-auto">
      <div className="p-6 pb-[calc(89px+env(safe-area-inset-bottom,0px))] max-sm:px-[13px] sm:pb-6 md:mx-auto md:w-4/5">
        {/* D19 order, sections 34 apart (21 on mobile) */}
        <div className="space-y-5 sm:space-y-8">
          <WalletSummary />

          {/* D19: Stakes sits right under the summary, above the tabs. It is
              not rendered with the pools flag off (059 I01). */}
          {import.meta.env.VITE_SHOW_CREATOR_POOL === "true" && (
            <Suspense>
              <StakesCard />
            </Suspense>
          )}

          <Suspense>
            <ProfileTabs />
          </Suspense>

          {/* 053 I01, 060 I01: Get tREVO holds the referee card (only for
              creators who joined through a link) across the full width, then
              the Testnet faucet and Invite cards in two equal columns
              (stacked, faucet first, below 1024). */}
          <section aria-labelledby="get-trevo-title" className="space-y-[21px] font-prism">
            <h2
              id="get-trevo-title"
              className="flex items-center gap-2 text-prism-eyebrow text-prism-ink-2"
            >
              <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
              GET tREVO
            </h2>
            <Suspense>
              <RefereeCard />
            </Suspense>
            <div className="grid items-start gap-[21px] lg:grid-cols-2">
              <Suspense>
                <FaucetCard />
              </Suspense>
              <Suspense>
                <InviteCard />
              </Suspense>
            </div>
          </section>

          <Suspense>
            <LaunchPoolAd />
          </Suspense>
        </div>
      </div>
      <Suspense>
        <SendFlow />
      </Suspense>
    </div>
  );

  return loggedInView;
}

import { lazy, Suspense, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useRnsSubPage } from "./rns/useRnsRoute";
import { RnsSubPage } from "./rns/RnsTab";
import { WalletErrorCard, WalletSummary, useNoWalletTimeout } from "./summary/WalletSummary";
import { USDC_FLAGS } from "@/config/usdc/flags";

// 062 I01: Send opens in the value panel at ?send=1 (D05, D12)
const SendFlow = lazy(() => import("./send/SendFlow"));
// Screen Review 137 (w3, w4, w6): the gasless USDC send at ?send=usdc
const UsdcSendFlow = lazy(() => import("./send/UsdcSendFlow"));
// Screen Review 138 (o1 to o7): Buy USDC through Coinbase at ?fund=usdc
const BuyUsdcFlow = lazy(() => import("./buy/BuyUsdcFlow"));
// Screen Review 059: Stakes replaces StakedPoolsSection on the Wallet
const StakesCard = lazy(() => import("./stakes/StakesCard"));
const ProfileTabs = lazy(() => import("./ProfileTabs"));
// The Get tREVO cards moved to Home; the Wallet keeps one row that links there
const GetTrevoRow = lazy(() => import("./faucet/GetTrevoRow"));
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

          <Suspense>
            <GetTrevoRow />
          </Suspense>

          <Suspense>
            <LaunchPoolAd />
          </Suspense>
        </div>
      </div>
      <Suspense>
        <SendFlow />
      </Suspense>
      {USDC_FLAGS.wallet && (
        <Suspense>
          <UsdcSendFlow />
        </Suspense>
      )}
      {USDC_FLAGS.onramp && (
        <Suspense>
          <BuyUsdcFlow />
        </Suspense>
      )}
    </div>
  );

  return loggedInView;
}

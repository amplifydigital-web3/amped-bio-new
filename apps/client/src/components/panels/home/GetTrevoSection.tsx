import { lazy, Suspense, useEffect } from "react";
import { useSearchParams } from "react-router";
import { focusFaucetHeading } from "../wallet/faucet/fundRow";
import { Eyebrow } from "./TestnetCard";

// The referee, faucet and invite cards moved here from the Wallet Get tREVO section
const RefereeCard = lazy(() => import("../wallet/referral/RefereeCard"));
const FaucetCard = lazy(() => import("../wallet/faucet/FaucetCard"));
const InviteCard = lazy(() => import("../wallet/referral/InviteCard"));

/** The faucet card renders after its query resolves, so keep looking for it. */
const FAUCET_FOCUS_TRIES = 300;

/**
 * ?open=faucet scrolls to the faucet card once it renders, then drops the
 * param. The param stays while the card is missing, so a slow connection
 * still ends on the focused card instead of on a silent Home.
 */
function useOpenFaucet() {
  const [params, setParams] = useSearchParams();
  const wanted = params.get("open") === "faucet";
  useEffect(() => {
    if (!wanted) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (focusFaucetHeading()) {
        clearInterval(timer);
        setParams(
          current => {
            const next = new URLSearchParams(current);
            next.delete("open");
            return next;
          },
          { replace: true }
        );
        return;
      }
      // Give up after 30 s, but keep the param so the intent survives
      if (tries >= FAUCET_FOCUS_TRIES) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [wanted, setParams]);
}

/**
 * Home Get tREVO: the referee card (only for creators who joined through a
 * link) across the full width, then the Daily faucet and Invite creators
 * cards in two equal columns once the left column is wide enough.
 */
export function GetTrevoSection() {
  useOpenFaucet();
  return (
    <section aria-labelledby="get-trevo-title" className="space-y-[21px] font-prism">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Eyebrow id="get-trevo-title">Get tREVO</Eyebrow>
          <p className="text-prism-body text-prism-ink-2">
            Test tokens to try staking, pools and payments.
          </p>
        </div>
        <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-prism-warning-bg px-2 text-prism-meta font-semibold text-prism-warning-ink shadow-[inset_0_0_0_1px_rgba(122,79,0,0.28)]">
          Testnet
        </span>
      </div>
      <Suspense>
        <RefereeCard />
      </Suspense>
      <div className="grid items-stretch gap-[21px] min-[1360px]:grid-cols-2">
        <Suspense>
          <FaucetCard />
        </Suspense>
        <Suspense>
          <InviteCard />
        </Suspense>
      </div>
    </section>
  );
}

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, ExternalLink } from "lucide-react";
import { Button, TESTNET_NOTICE, trpc } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useEditor } from "@/contexts/EditorContext";
import { appChainId } from "@/utils/appChain";
import { HELP_ARTICLES_URL } from "@/components/shell/useSupportWidget";

// Screen Review 061 (D19). The quietest card on Wallet, shown last and only
// to a creator with no pool. Copy is the wording Rob approved on 30 Sep (D1).
// Nothing renders while the pool check loads or when it fails.

const LaunchPoolAd: React.FC = () => {
  const { address } = useWalletContext();
  const { setActivePanelAndNavigate } = useEditor();
  const enabled = import.meta.env.VITE_SHOW_CREATOR_POOL === "true" && !!address;

  const myPool = useQuery({
    ...trpc.pools.creator.getPool.queryOptions({ chainId: appChainId() }),
    enabled,
    retry: false,
  });

  // getPool returns null when the creator has no pool on the app network
  if (!enabled || !myPool.isSuccess || myPool.data !== null) return null;

  return (
    <section
      aria-labelledby="wallet-pool-promo-title"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[13px] font-prism sm:flex-row sm:items-start sm:gap-[21px] sm:p-[21px]"
    >
      <span
        aria-hidden
        className="prism-glass-clear flex h-commit w-commit shrink-0 items-center justify-center !rounded-prism-13"
      >
        <Coins className="h-[21px] w-[21px] text-prism-value-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="wallet-pool-promo-title" className="text-prism-panel-title text-prism-ink">
          Start your creator pool
        </h2>
        <p className="mt-1 text-prism-body text-prism-ink-2">
          Fans stake tREVO in your pool to earn network rewards and support you. You choose your
          share of pool rewards at launch, from 0 to 100%.
        </p>
        <p className="mt-2 text-prism-meta text-prism-ink-2">{TESTNET_NOTICE}</p>
        <Button asChild variant="ghost" className="mt-1">
          <a href={HELP_ARTICLES_URL} target="_blank" rel="noopener noreferrer">
            How pools work
            <ExternalLink aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full shrink-0 sm:w-auto"
        onClick={() => setActivePanelAndNavigate("my-pool")}
      >
        <Coins aria-hidden />
        Create pool
      </Button>
    </section>
  );
};

export default LaunchPoolAd;

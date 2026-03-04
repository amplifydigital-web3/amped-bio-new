import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc/trpc";
import { trpcClient } from "@/utils/trpc/trpc";
import { Gift, ChevronDown, ChevronUp, Info, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { PROCESSING_TXID } from "@ampedbio/constants";

function RefereeRewardCard() {
  const { authUser } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const queryClient = useQueryClient();

  // Get referee's referral info (this includes refereeReward and affiliateWalletBalance from backend)
  const { data: myReferrer, isLoading: loadingReferrer } = useQuery({
    ...trpc.referral.myReferrer.queryOptions(),
    enabled: !!authUser,
  });

  const claimMutation = useMutation({
    mutationFn: async (referralId: number) => {
      return trpcClient.referral.claimRefereeReward.mutate({ referralId });
    },
    onSuccess: async data => {
      toast.success(`Reward claimed! TXID: ${data.txid.slice(0, 10)}...`);

      await queryClient.invalidateQueries({
        queryKey: trpc.referral.myReferrer.queryKey(),
      });

      setIsClaiming(false);
    },
    onError: error => {
      toast.error(error.message || "Failed to claim reward");
      setIsClaiming(false);
    },
    onMutate: () => {
      setIsClaiming(true);
    },
  });

  const handleClaim = () => {
    if (myReferrer?.id && !isClaiming) {
      claimMutation.mutate(myReferrer.id);
    }
  };

  if (!authUser || loadingReferrer) {
    return null;
  }

  // Don't show if no referral exists
  if (!myReferrer) {
    return null;
  }

  const hasClaimed = myReferrer.txid && myReferrer.txid !== PROCESSING_TXID;
  const isProcessing = myReferrer.txid === PROCESSING_TXID;

  // If claimed and collapsed, show minimal version
  if (hasClaimed && !isExpanded) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 overflow-hidden">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full p-3 flex items-center justify-between hover:bg-green-50/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Referral reward claimed</span>
          </div>
          <ChevronUp className="h-4 w-4 text-green-600" />
        </button>
      </div>
    );
  }

  // Show processing state
  if (isProcessing) {
    return (
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-yellow-900">Processing your reward</h4>
              <p className="text-xs text-yellow-700 mt-1">
                Your reward is being sent to your wallet. This may take a few moments.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show claimed state (expanded)
  if (hasClaimed) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 overflow-hidden">
        <button
          onClick={() => setIsExpanded(false)}
          className="w-full p-4 flex items-center justify-between hover:bg-green-50/50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-green-100 p-2 rounded-lg">
              <Gift className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-green-900">Referral reward claimed!</h4>
              <p className="text-xs text-green-700 mt-1">
                You received {myReferrer.refereeReward || "tokens"} for joining through a referral
              </p>
            </div>
          </div>
          <ChevronUp className="h-4 w-4 text-green-600 flex-shrink-0" />
        </button>

        {myReferrer.txid && (
          <div className="px-4 pb-4 pt-0">
            <a
              href={`https://libertas.revoscan.io/tx/${myReferrer.txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-medium text-green-700 hover:text-green-800 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View transaction
            </a>
          </div>
        )}
      </div>
    );
  }

  // Show claim button state (unclaimed)
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-blue-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Gift className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 text-left">
            <h4 className="text-sm font-semibold text-blue-900">
              You have a referral reward waiting!
            </h4>
            <p className="text-xs text-blue-700 mt-1">
              Claim {myReferrer.refereeReward || "your reward"} now
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-blue-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-blue-600 flex-shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-blue-200 px-4 pb-4 pt-4 space-y-3">
          {/* Explanation */}
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong>Why this reward?</strong> You joined our platform through a referral link.
                  As a thank you for joining, you receive a reward of{" "}
                  <strong className="text-blue-700">{myReferrer.refereeReward || "tokens"}</strong>.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed mt-2">
                  <strong>How it works:</strong> Both you and the person who referred you receive
                  rewards when you link your wallet and claim. This helps our community grow!
                </p>
              </div>
            </div>
          </div>

          {/* Auto-send info */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <p className="text-xs text-blue-800 leading-relaxed">
              <strong>Note:</strong> Even if you don't click claim now, the system will
              automatically try to send your reward soon. However, claiming manually ensures you
              receive it as quickly as possible.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {myReferrer.affiliateWalletBalance?.hasBalance === false ? (
              <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                <Info className="h-4 w-4 flex-shrink-0" />
                <span>Rewards are currently unavailable. Please try again later.</span>
              </div>
            ) : (
              <button
                onClick={handleClaim}
                disabled={isClaiming}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {isClaiming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Gift className="h-4 w-4" />
                    Claim {myReferrer.refereeReward || "Reward"}
                  </>
                )}
              </button>
            )}
          </div>

          {/* Referrer info */}
          {myReferrer.referrer && (
            <div className="flex items-center justify-between pt-2 border-t border-blue-200/50">
              <span className="text-xs text-gray-600">
                Referred by{" "}
                <a
                  href={`/${myReferrer.referrer.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {myReferrer.referrer.name || myReferrer.referrer.handle}
                </a>
              </span>
              <a
                href="https://amplifydigital.freshdesk.com/a/solutions/articles/154000249731"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
              >
                Learn more
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RefereeRewardCard;

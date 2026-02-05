import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc/trpc";
import { trpcClient } from "@/utils/trpc/trpc";
import { Copy, Check, Users, Link2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

function ReferralCard() {
  const { authUser } = useAuth();
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [claimingReferralId, setClaimingReferralId] = useState<number | null>(null);
  const referralsPerPage = 10;
  const queryClient = useQueryClient();

  const { data: referralsData, isLoading: loadingReferrals } = useQuery({
    ...trpc.referral.myReferrals.queryOptions({
      page: currentPage,
      limit: referralsPerPage,
    }),
    enabled: !!authUser,
  });

  const { data: stats } = useQuery({
    ...trpc.referral.referralStats.queryOptions(),
    enabled: !!authUser,
  });

  const { data: myReferrer } = useQuery({
    ...trpc.referral.myReferrer.queryOptions(),
    enabled: !!authUser,
  });

  const claimMutation = useMutation({
    mutationFn: async (referralId: number) => {
      return trpcClient.referral.claimReferralReward.mutate({ referralId });
    },
    onSuccess: (data) => {
      toast.success(`Reward claimed! TXID: ${data.txid.slice(0, 10)}...`);
      setClaimingReferralId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to claim reward");
      setClaimingReferralId(null);
    },
    onMutate: (referralId) => {
      setClaimingReferralId(referralId);
    },
  });

  const userIdHex = authUser ? `0x${authUser.id.toString(16)}` : "";
  const referralLink = userIdHex ? `${window.location.origin}?r=${userIdHex}` : "";

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    if (referralsData) {
      setCurrentPage(prev => Math.min(prev + 1, referralsData.totalPages));
    }
  };

  const handleClaimReward = (referralId: number) => {
    claimMutation.mutate(referralId);
  };

  if (!authUser) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div
        className="p-4 sm:p-6 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Link2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Referral Program</h3>
              <p className="text-sm text-gray-500">
                {stats?.totalReferrals || 0} total referral{stats?.totalReferrals !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200">
          <div className="p-4 sm:p-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Your Referral Link</p>
              <p className="text-xs text-gray-500 mb-3">Share this link to invite others</p>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <button
                  onClick={e => {
                    e.stopPropagation();
                    copyToClipboard();
                  }}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span className="hidden sm:inline">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span className="hidden sm:inline">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Your Referrer Section */}
            {myReferrer && (
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Your Referrer</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-blue-600">
                        {myReferrer.referrer.name?.charAt(0).toUpperCase() || "?"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {myReferrer.referrer.name || "Anonymous"}
                      </p>
                      {myReferrer.referrer.handle && (
                        <a
                          href={`${window.location.origin}/@${myReferrer.referrer.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                          onClick={e => e.stopPropagation()}
                        >
                          @{myReferrer.referrer.handle}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {myReferrer.txid ? (
                      <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                        Claimed
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClaimReward(myReferrer.id);
                        }}
                        disabled={claimingReferralId === myReferrer.id}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {claimingReferralId === myReferrer.id ? "Claiming..." : "Claim"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-6 text-sm">
              <div>
                <p className="font-semibold text-gray-900">{userIdHex}</p>
                <p className="text-gray-500">Your ID</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{stats?.totalReferrals || 0}</p>
                <p className="text-gray-500">Total Referrals</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Your Referrals</h4>
              </div>

              {loadingReferrals ? (
                <div className="p-4">
                  <div className="animate-pulse space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-3 bg-gray-200 rounded w-24"></div>
                          <div className="h-2 bg-gray-200 rounded w-20 mt-2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : referralsData?.referrals.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <h4 className="text-sm font-medium text-gray-900 mb-1">No referrals yet</h4>
                  <p className="text-xs text-gray-500">Start sharing your link to invite others!</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100">
                    {referralsData?.referrals.map(referral => (
                      <div key={referral.id} className="p-3 hover:bg-white transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-blue-600">
                                {referral.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {referral.name}
                              </p>
                              <a
                                href={`${window.location.origin}/@${referral.handle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                                onClick={e => e.stopPropagation()}
                              >
                                @{referral.handle || "no-handle"}
                              </a>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <p className="text-xs text-gray-500">
                              {new Date(referral.created_at).toLocaleDateString()}
                            </p>
                            {referral.txid ? (
                              <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                                Claimed
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClaimReward(referral.referralId);
                                }}
                                disabled={claimingReferralId === referral.referralId}
                                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {claimingReferralId === referral.referralId ? "Claiming..." : "Claim"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {referralsData && referralsData.totalPages > 1 && (
                    <div className="p-3 border-t border-gray-200 flex items-center justify-between">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handlePreviousPage();
                        }}
                        disabled={currentPage === 1}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm ${
                          currentPage === 1
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        <ChevronDown className="h-3 w-3 rotate-90" />
                        <span>Previous</span>
                      </button>

                      <div className="flex items-center space-x-1">
                        {Array.from({ length: referralsData.totalPages }, (_, i) => i + 1).map(
                          page => (
                            <button
                              key={page}
                              onClick={e => {
                                e.stopPropagation();
                                setCurrentPage(page);
                              }}
                              className={`w-7 h-7 rounded-lg text-xs ${
                                currentPage === page
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                              }`}
                            >
                              {page}
                            </button>
                          )
                        )}
                      </div>

                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleNextPage();
                        }}
                        disabled={currentPage === referralsData.totalPages}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm ${
                          currentPage === referralsData.totalPages
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        <span>Next</span>
                        <ChevronDown className="h-3 w-3 -rotate-90" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReferralCard;

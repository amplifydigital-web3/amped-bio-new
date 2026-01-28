import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc/trpc";
import { Copy, Check, Users, Link2 } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

export function ReferralTabContent() {
  const { authUser } = useAuth();
  const [copied, setCopied] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const referralsPerPage = 10;

  // Buscar lista de indicações com paginação
  const { data: referralsData, isLoading: loadingReferrals } = useQuery({
    ...trpc.referral.myReferrals.queryOptions({
      page: currentPage,
      limit: referralsPerPage,
    }),
    enabled: !!authUser,
  });

  // Buscar estatísticas
  const { data: stats } = useQuery({
    ...trpc.referral.referralStats.queryOptions(),
    enabled: !!authUser,
  });

  // Gerar link de referral usando userId em hex
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

  if (!authUser) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Please log in to view referral information</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Referral Program</h2>
        <p className="text-sm text-gray-500 mt-1">Invite friends and earn rewards when they join</p>
      </div>

      {/* Referral Link Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Your Referral Link</p>
            <p className="text-xs text-gray-500 mt-1">Share this link to invite others</p>
          </div>
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <Link2 className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm"
          />
          <button
            onClick={copyToClipboard}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-4 flex items-center space-x-6 text-sm">
          <div>
            <p className="font-semibold text-gray-900">{userIdHex}</p>
            <p className="text-gray-500">Your ID</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{stats?.totalReferrals || 0}</p>
            <p className="text-gray-500">Total Referrals</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalReferrals}</p>
              <p className="text-sm text-gray-500">Total Referrals</p>
            </div>
          </div>
        </div>
      )}

      {/* Referred Users List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Your Referrals</h3>
          <p className="text-sm text-gray-500 mt-1">Users who signed up using your link</p>
        </div>

        {loadingReferrals ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-3 bg-gray-200 rounded w-24 mt-2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : referralsData?.referrals.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No referrals yet</h4>
            <p className="text-gray-500 mb-4">Start sharing your link to invite others!</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {referralsData?.referrals.map(referral => (
                <div key={referral.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {referral.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{referral.name}</p>
                        <p className="text-sm text-gray-500">@{referral.handle || "no-handle"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        {new Date(referral.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {referralsData && referralsData.totalPages > 1 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                    currentPage === 1
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center space-x-2">
                  {Array.from({ length: referralsData.totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-sm ${
                        currentPage === page
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleNextPage}
                  disabled={currentPage === referralsData.totalPages}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                    currentPage === referralsData.totalPages
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Coming soon:</strong> Earn tokens for every successful referral! Stay tuned for
          our rewards program.
        </p>
      </div>
    </div>
  );
}

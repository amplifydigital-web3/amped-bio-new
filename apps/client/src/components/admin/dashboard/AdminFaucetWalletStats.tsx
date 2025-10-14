import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { Wallet, Copy, Info, AlertTriangle } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { truncateAddress } from "../../../utils/blockchain";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc";
import { trpcClient } from "../../../utils/trpc/trpc";
import { Switch } from "../../../components/ui/Switch";

export function AdminFaucetWalletStats() {
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: walletInfoData,
    isLoading,
    isError,
  } = useQuery(trpc.admin.wallet.getFaucetWalletInfo.queryOptions());

  const { data: faucetStatus, isLoading: isFaucetStatusLoading } = useQuery(
    trpc.admin.settings.getFaucetStatus.queryOptions()
  );

  const setFaucetStatus = useMutation({
    mutationFn: async (enabled: boolean) => {
      return trpcClient.admin.settings.setFaucetStatus.mutate({ enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.admin.settings.getFaucetStatus.queryOptions().queryKey,
      });
    },
  });

  const handleFaucetToggle = (enabled: boolean) => {
    setFaucetStatus.mutate(enabled);
  };

  const walletInfo =
    walletInfoData && "success" in walletInfoData && walletInfoData.success === true
      ? walletInfoData
      : null;

  const error =
    walletInfoData && "success" in walletInfoData && walletInfoData.success === false
      ? (walletInfoData as any).error
      : null;

  // Handle copy to clipboard
  const handleCopyAddress = () => {
    if (!(walletInfo as any)?.address) return;

    navigator.clipboard.writeText((walletInfo as any).address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Faucet Wallet
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Faucet Enabled</span>
            <Switch
              checked={faucetStatus || false}
              onChange={handleFaucetToggle}
              disabled={true}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24">
            <p className="text-sm text-gray-500">Loading wallet information...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || error) {
    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Faucet Wallet
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Faucet Enabled</span>
            <Switch
              checked={faucetStatus || false}
              onChange={handleFaucetToggle}
              disabled={isFaucetStatusLoading || setFaucetStatus.isPending}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm">Error loading wallet information</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!walletInfo) {
    return null; // Or some other fallback if walletInfo is null after loading and no error
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Faucet Wallet
            {(walletInfo as any).isMockMode && (
              <Tooltip
                content={
                  <p className="text-xs max-w-xs">
                    The faucet is running in mock mode. No actual tokens are being sent.
                  </p>
                }
              >
                <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5 rounded">
                  Mock Mode
                </span>
              </Tooltip>
            )}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Faucet Enabled</span>
          <Switch
            checked={faucetStatus || false}
            onChange={handleFaucetToggle}
            disabled={isFaucetStatusLoading || setFaucetStatus.isPending}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">Address</p>
            <button
              onClick={handleCopyAddress}
              className="text-xs flex items-center gap-0.5 text-gray-500 hover:text-gray-700"
            >
              {copied ? "Copied!" : "Copy"} <Copy className="h-3 w-3 ml-0.5" />
            </button>
          </div>
          <p className="text-sm font-mono bg-gray-50 p-2 rounded-md overflow-auto whitespace-nowrap">
            {truncateAddress((walletInfo as any).address, 12, 8)}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-gray-500">Balances Across Networks</p>
          {(walletInfo as any).balances.length > 0 ? (
            (walletInfo as any).balances.map((chainBalance: any) => {
              const remainingAirdrops =
                isNaN(Number(chainBalance.balance)) ||
                isNaN(Number((walletInfo as any).faucetAmount)) ||
                Number((walletInfo as any).faucetAmount) === 0
                  ? NaN
                  : Math.floor(
                      Number(chainBalance.balance) /
                        (Number((walletInfo as any).faucetAmount) * 1e18)
                    );
              return (
                <div key={chainBalance.chainId} className="grid grid-cols-2 gap-4 border-t pt-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{chainBalance.chainName} Balance</p>
                    <p className="text-lg font-semibold">
                      {isNaN(Number(chainBalance.formattedBalance)) ||
                      chainBalance.formattedBalance === "N/A" ? (
                        <Tooltip content="Could not fetch balance for this chain">
                          <span>-</span>
                        </Tooltip>
                      ) : (
                        <>
                          {(Number(chainBalance.formattedBalance) / 1e18).toFixed(4)}{" "}
                          {chainBalance.currency}
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <p className="text-xs text-gray-500">Remaining Airdrops</p>
                      <Tooltip
                        content={
                          isNaN(remainingAirdrops) ? (
                            <p className="text-xs max-w-xs">
                              Could not calculate remaining airdrops.
                            </p>
                          ) : (
                            <p className="text-xs max-w-xs">
                              Estimated number of airdrops left based on current balance and faucet
                              amount per airdrop ({(walletInfo as any).faucetAmount}{" "}
                              {chainBalance.currency}) on {chainBalance.chainName}
                            </p>
                          )
                        }
                      >
                        <Info className="h-3 w-3 text-gray-400" />
                      </Tooltip>
                    </div>
                    <p
                      className={`text-lg font-semibold ${
                        isNaN(remainingAirdrops)
                          ? "text-gray-500"
                          : remainingAirdrops < 10
                            ? "text-red-600"
                            : remainingAirdrops < 50
                              ? "text-amber-600"
                              : "text-green-600"
                      }`}
                    >
                      {isNaN(remainingAirdrops) ? "-" : `~${remainingAirdrops.toLocaleString()}`}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-gray-500">No balances available.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

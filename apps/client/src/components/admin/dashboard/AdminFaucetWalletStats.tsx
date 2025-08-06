import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { Wallet, Copy, Info, AlertTriangle } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { truncateAddress } from "../../../utils/blockchain";

interface AdminFaucetWalletStatsProps {
  walletInfo: {
    address: string;
    formattedBalance: string;
    remainingAirdrops: number;
    faucetAmount: number;
    currency: string;
    isMockMode: boolean;
    error?: string;
  } | null;
}

export function AdminFaucetWalletStats({ walletInfo }: AdminFaucetWalletStatsProps) {
  const [copied, setCopied] = useState(false);

  // Handle copy to clipboard
  const handleCopyAddress = () => {
    if (!walletInfo?.address) return;

    navigator.clipboard.writeText(walletInfo.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!walletInfo) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Faucet Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24">
            <p className="text-sm text-gray-500">Loading wallet information...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (walletInfo.error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Faucet Wallet
          </CardTitle>
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Faucet Wallet
          {walletInfo.isMockMode && (
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
            {truncateAddress(walletInfo.address, 12, 8)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Balance</p>
            <p className="text-lg font-semibold">
              {parseFloat(walletInfo.formattedBalance).toFixed(4)} {walletInfo.currency}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-gray-500">Remaining Airdrops</p>
              <Tooltip
                content={
                  <p className="text-xs max-w-xs">
                    Estimated number of airdrops left based on current balance and faucet amount per
                    airdrop ({walletInfo.faucetAmount} {walletInfo.currency})
                  </p>
                }
              >
                <Info className="h-3 w-3 text-gray-400" />
              </Tooltip>
            </div>
            <p
              className={`text-lg font-semibold ${
                walletInfo.remainingAirdrops < 10
                  ? "text-red-600"
                  : walletInfo.remainingAirdrops < 50
                    ? "text-amber-600"
                    : "text-green-600"
              }`}
            >
              ~{walletInfo.remainingAirdrops.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

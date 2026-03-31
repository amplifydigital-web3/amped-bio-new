import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNdauWallet } from "@/ndau-wallet/contexts/NdauWalletContext";
import { NdauConnect } from "@/ndau-wallet/components/NdauConnect";
import { trpc } from "@/utils/trpc/trpc";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { NDAU_TO_REVO_RATE, calculateRevoAmount } from "@ampedbio/constants";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

export default function NdauConversionPage() {
  const { authUser } = useAuth();
  const { walletAddress: ndauAddress } = useNdauWallet();
  const [ndauBalance, setNdauBalance] = useState("");
  const [revoAmount, setRevoAmount] = useState("");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const isConnected = !!ndauAddress;

  useEffect(() => {
    if (ndauBalance) {
      const calculated = calculateRevoAmount(ndauBalance);
      setRevoAmount(calculated);
    } else {
      setRevoAmount("");
    }
  }, [ndauBalance]);

  const submitMutation = useMutation({
    mutationFn: trpc.ndauConversion.submitConversion.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success("Conversion request submitted successfully!");
      setIsConfirmDialogOpen(false);
    },
    onError: error => {
      toast.error(`Failed to submit conversion: ${error.message}`);
      setIsConfirmDialogOpen(false);
    },
  });

  const handleSubmit = () => {
    if (!authUser) {
      toast.error("Please log in to submit a conversion request");
      return;
    }

    if (!ndauBalance || parseFloat(ndauBalance) <= 0) {
      toast.error("No NDAU balance available to convert");
      return;
    }

    if (!ndauAddress) {
      toast.error("Please connect your NDAU account first");
      return;
    }

    setIsConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = () => {
    if (!authUser?.wallet) {
      toast.error("Please connect your REVO wallet first");
      return;
    }

    submitMutation.mutate({
      ndauAddress,
      ndauAmount: ndauBalance,
      revoAddress: authUser.wallet,
    });
  };

  const isSubmitDisabled = !isConnected || !ndauBalance || parseFloat(ndauBalance) <= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            NDAU to REVO Conversion
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Convert your NDAU tokens to REVO tokens at a fixed rate. Connect each NDAU account
            separately to convert multiple accounts.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-full">
                <ArrowRight className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  1 NDAU = {NDAU_TO_REVO_RATE} REVO
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Connect NDAU Account
            </h2>
            {!isConnected ? (
              <NdauConnect buttonText="Connect NDAU Account" />
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Account Connected
                        </p>
                        <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                          {ndauAddress}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {ndauBalance || "0.000"} NDAU
                      </p>
                    </div>
                  </div>
                </div>
                <NdauConnect buttonText="Connect Different Account" />
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <Label className="text-gray-900 dark:text-white">Amount to Convert</Label>
              <div className="mt-1 h-12 text-lg bg-gray-100 dark:bg-gray-700 rounded-md px-3 py-2 flex items-center">
                <span className="text-gray-900 dark:text-white font-medium">
                  {ndauBalance || "0.000"} NDAU
                </span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  (Full Balance)
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Your full account balance will be converted
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">You will receive</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {revoAmount || "0.000"} REVO
                  </p>
                </div>
                <ArrowRight className="h-6 w-6 text-gray-400" />
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitDisabled || submitMutation.isPending}
              className="w-full h-12 text-lg"
              variant="confirm"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : !authUser ? (
                <>
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Login Required to Submit
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Submit Conversion Request
                </>
              )}
            </Button>

            {!authUser && (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                You need to be logged in to submit a conversion request
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How it works:</h3>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li className="flex items-start">
              <span className="mr-2">1.</span>
              <span>Connect your NDAU account to view your balance</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">2.</span>
              <span>
                If you have multiple NDAU accounts, connect and submit each one separately
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">3.</span>
              <span>Your full NDAU balance will be automatically converted to REVO</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">4.</span>
              <span>Submit the conversion request (login required)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">5.</span>
              <span>
                Admin will process your request and send REVO tokens to your connected wallet
              </span>
            </li>
          </ul>
        </div>
      </div>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Conversion Request</DialogTitle>
            <DialogDescription>Please review your conversion details and confirm</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">NDAU Amount:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {ndauBalance} NDAU
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">You will receive:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {revoAmount} REVO
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">NDAU Address:</span>
                <span className="font-mono text-xs text-gray-900 dark:text-white break-all max-w-[200px]">
                  {ndauAddress}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">REVO Address:</span>
                <span className="font-mono text-xs text-gray-900 dark:text-white break-all max-w-[200px]">
                  {authUser?.wallet || "Not connected"}
                </span>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Terms Agreement:</strong> By confirming, you agree to the conversion terms
                and understand that the admin will process your request manually. The REVO tokens
                will be sent to your connected wallet address.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmDialogOpen(false)}
              disabled={submitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="confirm"
              onClick={handleConfirmSubmit}
              disabled={submitMutation.isPending || !authUser?.wallet}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Conversion"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

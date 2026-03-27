import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/utils/trpc/trpc";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Wallet, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { NDAU_TO_REVO_RATE, calculateRevoAmount } from "@ampedbio/constants";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

// Mock data for NDAU wallet
const MOCK_NDAU_BALANCE = "150.5";
const MOCK_NDAU_ADDRESS = "ndau1xvt4e6l8h9q2s3p4r5m6n7k8j9h0g1f2d3s4a5";

export default function NdauConversionPage() {
  const { authUser, isPending: authPending } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [ndauAddress, setNdauAddress] = useState("");
  const [ndauBalance, setNdauBalance] = useState("");
  const [ndauAmount, setNdauAmount] = useState("");
  const [revoAmount, setRevoAmount] = useState("");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  // Mock connect NDAU wallet
  const handleConnectNdauWallet = () => {
    setNdauAddress(MOCK_NDAU_ADDRESS);
    setNdauBalance(MOCK_NDAU_BALANCE);
    setIsConnected(true);
    toast.success("NDAU wallet connected successfully!");
  };

  // Calculate REVO amount when NDAU amount changes
  useEffect(() => {
    if (ndauAmount) {
      const calculated = calculateRevoAmount(ndauAmount);
      setRevoAmount(calculated);
    } else {
      setRevoAmount("");
    }
  }, [ndauAmount]);

  const submitMutation = useMutation({
    mutationFn: trpc.ndauConversion.submitConversion.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success("Conversion request submitted successfully!");
      setIsConfirmDialogOpen(false);
      setNdauAmount("");
      setRevoAmount("");
    },
    onError: (error) => {
      toast.error(`Failed to submit conversion: ${error.message}`);
      setIsConfirmDialogOpen(false);
    },
  });

  const handleSubmit = () => {
    if (!authUser) {
      toast.error("Please log in to submit a conversion request");
      return;
    }

    if (!ndauAmount || parseFloat(ndauAmount) <= 0) {
      toast.error("Please enter a valid NDAU amount");
      return;
    }

    if (!ndauAddress) {
      toast.error("Please connect your NDAU wallet first");
      return;
    }

    // Open confirmation dialog
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = () => {
    if (!authUser?.wallet) {
      toast.error("Please connect your REVO wallet first");
      return;
    }

    submitMutation.mutate({
      ndauAddress,
      ndauAmount,
      revoAddress: authUser.wallet,
    });
  };

  const isSubmitDisabled = !isConnected || !ndauAmount || parseFloat(ndauAmount) <= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            NDAU to REVO Conversion
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Convert your NDAU tokens to REVO tokens at a fixed rate
          </p>
        </div>

        {/* Conversion Rate Card */}
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

        {/* Main Conversion Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          {/* Connect NDAU Wallet */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Connect NDAU Wallet
            </h2>
            {!isConnected ? (
              <Button
                onClick={handleConnectNdauWallet}
                className="w-full h-12 text-lg"
                variant="default"
              >
                <Wallet className="h-5 w-5 mr-2" />
                Connect NDAU Wallet
              </Button>
            ) : (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Wallet Connected</p>
                      <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                        {ndauAddress}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {ndauBalance} NDAU
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Conversion Form */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="ndauAmount" className="text-gray-900 dark:text-white">
                NDAU Amount
              </Label>
              <Input
                id="ndauAmount"
                type="number"
                placeholder="Enter NDAU amount"
                value={ndauAmount}
                onChange={(e) => setNdauAmount(e.target.value)}
                className="mt-1 h-12 text-lg"
                disabled={!isConnected}
                min="0"
                step="0.001"
              />
              {isConnected && ndauBalance && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Available: {ndauBalance} NDAU
                </p>
              )}
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

            {/* Submit Button */}
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

        {/* Information Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            How it works:
          </h3>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li className="flex items-start">
              <span className="mr-2">1.</span>
              <span>Connect your NDAU wallet to view your balance</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">2.</span>
              <span>Enter the amount of NDAU you want to convert</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">3.</span>
              <span>Submit the conversion request (login required)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">4.</span>
              <span>Admin will process your request and send REVO tokens to your connected wallet</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Conversion Request</DialogTitle>
            <DialogDescription>
              Please review your conversion details and confirm
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">NDAU Amount:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {ndauAmount} NDAU
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

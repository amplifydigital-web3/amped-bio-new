import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNdauWallet } from "@/ndau-wallet/contexts/NdauWalletContext";
import { useNdauSigner } from "@/ndau-wallet/hooks/useNdauSigner";
import { NdauConnect } from "@/ndau-wallet/components/NdauConnect";
import { trpc } from "@/utils/trpc/trpc";
import { Button } from "@/components/ui/Button";
import { NDAU_TO_REVO_RATE, calculateRevoAmount } from "@ampedbio/constants";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import yaml from "yaml";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Wallet,
  PenTool,
  Send,
  Clock,
} from "lucide-react";

const SIGNATURE_MESSAGE = "I agreed to the conversion to Revo";

type Step = 1 | 2 | 3 | 4 | 5;

const StepIndicator = ({
  currentStep,
  completedSteps,
}: {
  currentStep: Step;
  completedSteps: Set<Step>;
}) => {
  const steps = [
    { num: 1, label: "Connect AmpedBio" },
    { num: 2, label: "Connect NDAU" },
    { num: 3, label: "Sign AmpedBio" },
    { num: 4, label: "Sign NDAU" },
    { num: 5, label: "Submit" },
  ];

  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <div key={step.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                completedSteps.has(step.num as Step)
                  ? "bg-green-500 text-white"
                  : currentStep === step.num
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}
            >
              {completedSteps.has(step.num as Step) ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                step.num
              )}
            </div>
            <span className="text-xs mt-1 text-gray-500 dark:text-gray-400 hidden sm:block">
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`w-8 sm:w-12 h-1 mx-1 rounded ${
                completedSteps.has(step.num as Step)
                  ? "bg-green-500"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default function NdauConversionPage() {
  const { authUser } = useAuth();
  const { walletAddress: ndauAddress, validationKey: ndauValidationKey } = useNdauWallet();
  const { signMessageAsync, isPending: isAmpedbioSigning } = useSignMessage();

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  const [ndauBalance, setNdauBalance] = useState("");
  const [revoAmount, setRevoAmount] = useState("");
  const [ampedbioSignature, setAmpedbioSignature] = useState<string | null>(null);
  const [ndauSignature, setNdauSignature] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const { requestSignature, isSigning: isNdauSigning, remainingSeconds } = useNdauSigner();

  const isAmpedbioConnected = !!authUser?.wallet;
  const isNdauConnected = !!ndauAddress;

  const { data: existingConversion, refetch: checkExisting } = useQuery(
    trpc.ndauConversion.checkExistingConversion.queryOptions(
      { ndauAddress: ndauAddress || "" },
      { enabled: false }
    )
  );

  const { data: ndauBalanceData, refetch: fetchNdauBalance } = useQuery(
    trpc.ndauConversion.getNdauBalance.queryOptions(
      { ndauAddress: ndauAddress || "" },
      { enabled: false }
    )
  );

  useEffect(() => {
    if (ndauBalanceData?.success && ndauBalanceData.balance) {
      setNdauBalance(ndauBalanceData.balance);
    } else if (ndauBalanceData?.success === false) {
      setNdauBalance("0");
    }
  }, [ndauBalanceData]);

  useEffect(() => {
    if (ndauBalance) {
      const calculated = calculateRevoAmount(ndauBalance);
      setRevoAmount(calculated);
    } else {
      setRevoAmount("");
    }
  }, [ndauBalance]);

  useEffect(() => {
    if (isAmpedbioConnected && !completedSteps.has(1)) {
      setCompletedSteps(prev => new Set(prev).add(1));
      if (currentStep === 1) setCurrentStep(2);
    }
  }, [isAmpedbioConnected, completedSteps, currentStep]);

  useEffect(() => {
    if (isNdauConnected && ndauAddress) {
      console.log(`[NDAU-CONVERSION] NDAU wallet connected: ${ndauAddress}, fetching balance...`);

      Promise.all([checkExisting(), fetchNdauBalance()])
        .then(([existingResult, balanceResult]) => {
          console.log(
            `[NDAU-CONVERSION] Balance fetch completed for ${ndauAddress}:`,
            balanceResult.data
          );

          if (existingResult.data?.exists) {
            console.log(`[NDAU-CONVERSION] Conversion already exists for ${ndauAddress}`);
            setAlreadySubmitted(true);
            toast.error("This NDAU wallet has already submitted a conversion request");
          } else if (!completedSteps.has(2)) {
            setCompletedSteps(prev => new Set(prev).add(2));
            if (currentStep === 2) setCurrentStep(3);
          }

          // Show balance info
          if (balanceResult.data?.success) {
            console.log(
              `[NDAU-CONVERSION] Balance for ${ndauAddress}: ${balanceResult.data.balance} NDAU`
            );
            toast.success(`NDAU balance: ${balanceResult.data.balance} NDAU`);
          } else if (balanceResult.data && "error" in balanceResult.data) {
            console.error(
              `[NDAU-CONVERSION] Failed to fetch balance for ${ndauAddress}:`,
              balanceResult.data.error
            );
            toast.error(`Failed to fetch NDAU balance: ${balanceResult.data.error}`);
          }
        })
        .catch(error => {
          console.error(`[NDAU-CONVERSION] Error fetching data for ${ndauAddress}:`, error);
        });
    }
  }, [isNdauConnected, ndauAddress, checkExisting, fetchNdauBalance, completedSteps, currentStep]);

  const handleSignAmpedbio = async () => {
    try {
      const signature = await signMessageAsync({ message: SIGNATURE_MESSAGE });
      setAmpedbioSignature(signature);
      setCompletedSteps(prev => new Set(prev).add(3));
      setCurrentStep(4);
      toast.success("AmpedBio wallet signed successfully");
    } catch (error) {
      toast.error("Failed to sign with AmpedBio wallet");
    }
  };

  const handleSignNdau = useCallback(async () => {
    if (!ndauAddress) return;

    console.log("[NDAU-CONVERSION] handleSignNdau called", {
      ndauAddress,
      ndauValidationKey,
      authUserWallet: authUser?.wallet,
    });

    const payload = {
      vote: "yes",
      proposal: {
        proposal_id: "ndau-to-revo-conversion",
        proposal_heading: `I agree to convert my ndau to the Ethereum address: ${authUser?.wallet}`,
        voting_option_id: 1,
        voting_option_heading: "Confirm Conversion",
      },
      wallet_address: ndauAddress,
      validation_key: ndauValidationKey || ndauAddress,
    };

    console.log("[NDAU-CONVERSION] Payload YAML:", yaml.stringify(payload));

    const payloadBase64 = btoa(yaml.stringify(payload));

    console.log("[NDAU-CONVERSION] Payload base64:", payloadBase64);

    try {
      console.log("[NDAU-CONVERSION] Calling requestSignature...");
      const result = await requestSignature(payloadBase64, ndauAddress);
      console.log("[NDAU-CONVERSION] requestSignature resolved:", result);
      setNdauSignature(result.signature);
      setCompletedSteps(prev => new Set(prev).add(4));
      setCurrentStep(5);
      toast.success("NDAU wallet signed successfully");
    } catch (err) {
      console.error("[NDAU-CONVERSION] requestSignature failed:", err);
      toast.error((err as Error).message || "Failed to sign with NDAU wallet");
    }
  }, [ndauAddress, authUser?.wallet, requestSignature, ndauValidationKey]);

  const submitMutation = useMutation({
    mutationFn: trpc.ndauConversion.submitConversion.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success("Conversion request submitted successfully!");
      setCompletedSteps(prev => new Set(prev).add(5));
    },
    onError: error => {
      toast.error(`Failed to submit conversion: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    if (!authUser?.wallet || !ndauAddress || !ampedbioSignature || !ndauSignature) {
      toast.error("Please complete all steps before submitting");
      return;
    }

    // Validate NDAU balance locally for UX (backend will fetch actual value)
    const ndauBalanceNum = parseFloat(ndauBalance || "0");

    if (isNaN(ndauBalanceNum) || ndauBalanceNum <= 0) {
      toast.error("Invalid NDAU balance. Please check your NDAU wallet connection.");
      return;
    }

    submitMutation.mutate({
      ndauAddress,
      revoAddress: authUser.wallet,
      ampedbioSignature,
      ndauSignature,
      ndauValidationKey: ndauValidationKey || ndauAddress,
    });
  };

  const truncateSignature = (sig: string) => {
    return `${sig.slice(0, 10)}...${sig.slice(-8)}`;
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isStepDisabled = (step: Step) => {
    if (alreadySubmitted) return true;
    if (step === 1) return false;
    if (step === 2) return !completedSteps.has(1);
    if (step === 3) return !completedSteps.has(2);
    if (step === 4) return !completedSteps.has(3);
    if (step === 5) return !completedSteps.has(4);
    return false;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            NDAU to REVO Conversion
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Convert your NDAU tokens to REVO tokens at a fixed rate. Complete all steps to submit
            your conversion request.
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

        <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />

        {alreadySubmitted && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-red-800 dark:text-red-200 font-medium">
                This NDAU wallet has already submitted a conversion request. You cannot submit
                again.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-6">
          {/* Step 1: Connect AmpedBio */}
          <div
            className={`p-4 rounded-lg border-2 transition-colors ${
              currentStep === 1
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : completedSteps.has(1)
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Step 1: Connect AmpedBio Wallet
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isAmpedbioConnected
                      ? `Connected: ${authUser?.wallet?.slice(0, 8)}...${authUser?.wallet?.slice(-6)}`
                      : "Connect your AmpedBio wallet to proceed"}
                  </p>
                </div>
              </div>
              {completedSteps.has(1) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>
            {!isAmpedbioConnected && (
              <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                Please log in and connect your wallet from the header.
              </p>
            )}
          </div>

          {/* Step 2: Connect NDAU */}
          <div
            className={`p-4 rounded-lg border-2 transition-colors ${
              currentStep === 2
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : completedSteps.has(2)
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
            } ${isStepDisabled(2) ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Step 2: Connect NDAU Wallet
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isNdauConnected
                      ? `Connected: ${ndauAddress?.slice(0, 8)}...${ndauAddress?.slice(-6)}`
                      : "Scan QR code with your NDAU wallet app"}
                  </p>
                </div>
              </div>
              {completedSteps.has(2) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>
            {!isNdauConnected && !isStepDisabled(2) && (
              <div className="mt-3">
                <NdauConnect buttonText="Connect NDAU Wallet" />
              </div>
            )}
            {isNdauConnected && ndauBalance && ndauBalanceData?.success === true && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    NDAU Balance:
                  </span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {parseFloat(ndauBalance).toFixed(6)} NDAU
                  </span>
                </div>
                {revoAmount && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      You will receive:
                    </span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {revoAmount} REVO
                    </span>
                  </div>
                )}
              </div>
            )}

            {isNdauConnected && ndauBalanceData?.success === false && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Failed to fetch NDAU balance
                  </p>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Check browser console for detailed error information.
                </p>
              </div>
            )}
          </div>

          {/* Step 3: Sign with AmpedBio */}
          <div
            className={`p-4 rounded-lg border-2 transition-colors ${
              currentStep === 3
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : completedSteps.has(3)
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
            } ${isStepDisabled(3) ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PenTool className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Step 3: Sign with AmpedBio Wallet
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {ampedbioSignature
                      ? `Signed: ${truncateSignature(ampedbioSignature)}`
                      : `Sign the message: "${SIGNATURE_MESSAGE}"`}
                  </p>
                </div>
              </div>
              {completedSteps.has(3) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>
            {!ampedbioSignature && !isStepDisabled(3) && (
              <Button
                onClick={handleSignAmpedbio}
                disabled={isAmpedbioSigning || alreadySubmitted}
                className="mt-3"
              >
                {isAmpedbioSigning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <PenTool className="h-4 w-4 mr-2" />
                    Sign with AmpedBio Wallet
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Step 4: Sign with NDAU */}
          <div
            className={`p-4 rounded-lg border-2 transition-colors ${
              currentStep === 4
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : completedSteps.has(4)
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
            } ${isStepDisabled(4) ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PenTool className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Step 4: Sign with NDAU Wallet
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {ndauSignature
                      ? `Signed: ${truncateSignature(ndauSignature)}`
                      : "Open your NDAU wallet app to confirm the signature request"}
                  </p>
                </div>
              </div>
              {completedSteps.has(4) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>
            {!ndauSignature && !isStepDisabled(4) && (
              <div className="mt-3 space-y-3">
                <Button onClick={handleSignNdau} disabled={isNdauSigning || alreadySubmitted}>
                  {isNdauSigning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Waiting for signature...
                    </>
                  ) : (
                    <>
                      <PenTool className="h-4 w-4 mr-2" />
                      Sign with NDAU Wallet
                    </>
                  )}
                </Button>
                {isNdauSigning && remainingSeconds > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="h-4 w-4" />
                    <span>
                      Time remaining:{" "}
                      <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                        {formatCountdown(remainingSeconds)}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 5: Submit */}
          <div
            className={`p-4 rounded-lg border-2 transition-colors ${
              currentStep === 5
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : completedSteps.has(5)
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
            } ${isStepDisabled(5) ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Send className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Step 5: Submit Conversion Request
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Review and submit your conversion request
                  </p>
                </div>
              </div>
              {completedSteps.has(5) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>

            {completedSteps.has(4) && !completedSteps.has(5) && (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">NDAU Address:</span>
                    <span className="font-mono text-xs text-gray-900 dark:text-white break-all max-w-[200px]">
                      {ndauAddress}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">REVO Address:</span>
                    <span className="font-mono text-xs text-gray-900 dark:text-white break-all max-w-[200px]">
                      {authUser?.wallet}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">NDAU Amount:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {ndauBalance || "0.000"} NDAU
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      You will receive:
                    </span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {revoAmount || "0.000"} REVO
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      AmpedBio Signature:
                    </span>
                    <span
                      className="font-mono text-xs text-gray-900 dark:text-white"
                      title={ampedbioSignature || ""}
                    >
                      {ampedbioSignature ? truncateSignature(ampedbioSignature) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      NDAU Signature:
                    </span>
                    <span
                      className="font-mono text-xs text-gray-900 dark:text-white"
                      title={ndauSignature || ""}
                    >
                      {ndauSignature ? truncateSignature(ndauSignature) : "-"}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending || alreadySubmitted}
                  variant="confirm"
                  className="w-full h-12 text-lg"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Submit Conversion Request
                    </>
                  )}
                </Button>
              </div>
            )}

            {completedSteps.has(5) && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-green-800 dark:text-green-200 font-medium">
                    Conversion request submitted successfully! An admin will process your request.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How it works:</h3>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li className="flex items-start">
              <span className="mr-2">1.</span>
              <span>Connect your AmpedBio (REVO) wallet</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">2.</span>
              <span>Connect your NDAU wallet via QR code</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">3.</span>
              <span>Sign the agreement message with your AmpedBio wallet</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">4.</span>
              <span>Sign the agreement message with your NDAU wallet</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">5.</span>
              <span>Submit your conversion request for admin review</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

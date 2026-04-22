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
import {
  verifyNdauSignature,
  createNdauConversionPayload,
  payloadToYaml,
  type NdauConversionPayload,
} from "@/utils/ndauSignature";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Wallet,
  PenTool,
  Send,
  Clock,
  FileText,
} from "lucide-react";

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
    { num: 3, label: "Sign Conversion" },
    { num: 4, label: "Submit" },
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
  const [ampedbioTimestamp, setAmpedbioTimestamp] = useState<number | null>(null);
  const [ndauTimestamp, setNdauTimestamp] = useState<number | null>(null);
  const [conversionTimestamp, setConversionTimestamp] = useState<number | null>(null);
  const [documentHash, setDocumentHash] = useState<string | null>(null);
  const [isCalculatingHash, setIsCalculatingHash] = useState(false);
  const [signatureValid, setSignatureValid] = useState<boolean | null>(null);
  const [isVerifyingSignature, setIsVerifyingSignature] = useState(false);
  const { requestSignature, isSigning: isNdauSigning, remainingSeconds } = useNdauSigner();

  const isAmpedbioConnected = !!authUser?.wallet;
  const isNdauConnected = !!ndauAddress;

  const { data: existingConversion, refetch: checkExisting } = useQuery(
    trpc.ndauConversion.checkExistingConversion.queryOptions(
      { ndauAddress: ndauAddress || "" },
      { enabled: false }
    )
  );

  const { data: conversionDetails, refetch: getConversionDetails } = useQuery(
    trpc.ndauConversion.getConversion.queryOptions(
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
      console.log(`[NDAU-CONVERSION] NDAU account connected: ${ndauAddress}, fetching balance...`);

      Promise.all([checkExisting(), fetchNdauBalance()])
        .then(([existingResult, balanceResult]) => {
          console.log(
            `[NDAU-CONVERSION] Balance fetch completed for ${ndauAddress}:`,
            balanceResult.data
          );

          if (existingResult.data?.exists) {
            console.log(`[NDAU-CONVERSION] Conversion already exists for ${ndauAddress}`);
            setAlreadySubmitted(true);

            getConversionDetails().then(detailsResult => {
              if (detailsResult.data) {
                console.log(`[NDAU-CONVERSION] Conversion details:`, detailsResult.data);
              }
            });
          } else if (!completedSteps.has(2)) {
            setCompletedSteps(prev => new Set(prev).add(2));
            if (currentStep === 2) setCurrentStep(3);
          }

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
  }, [
    isNdauConnected,
    ndauAddress,
    checkExisting,
    fetchNdauBalance,
    completedSteps,
    currentStep,
    getConversionDetails,
  ]);

  useEffect(() => {
    if (ampedbioSignature && ndauSignature && !completedSteps.has(3)) {
      setCompletedSteps(prev => new Set(prev).add(3));
      if (currentStep === 3) setCurrentStep(4);
    }
  }, [ampedbioSignature, ndauSignature, completedSteps, currentStep]);

  const calculateDocumentHash = async (): Promise<string> => {
    try {
      const response = await fetch("/docs/NDAU_to_REVO_Token_Conversion_Agreement.pdf");
      const arrayBuffer = await response.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      return hashHex;
    } catch (error) {
      console.error("Failed to calculate document hash:", error);
      throw new Error("Failed to calculate document hash");
    }
  };

  const handleSignAmpedbio = async () => {
    try {
      setIsCalculatingHash(true);
      const hash = await calculateDocumentHash();
      setDocumentHash(hash);

      const timestamp = Math.floor(Date.now() / 1000);
      setConversionTimestamp(timestamp);

      const ndauAmountNum = parseFloat(ndauBalance || "0");
      const signatureMessage = `I agree to convert ${ndauAmountNum} NDAU to ${revoAmount || "0"} REVO (rate: 1 NDAU = ${NDAU_TO_REVO_RATE} REVO) from ${ndauAddress} to ${authUser?.wallet}. Document hash: ${hash}. Timestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message: signatureMessage });

      setAmpedbioSignature(signature);
      setAmpedbioTimestamp(timestamp);
      toast.success("AmpedBio wallet signed successfully");
    } catch (error) {
      toast.error("Failed to sign with AmpedBio wallet");
    } finally {
      setIsCalculatingHash(false);
    }
  };

  const handleSignNdau = useCallback(async () => {
    if (!ndauAddress || !authUser?.wallet) return;

    console.log("[NDAU-CONVERSION] handleSignNdau called", {
      ndauAddress,
      ndauValidationKey,
      authUserWallet: authUser.wallet,
    });

    const ndauAmount = ndauBalance || "0";
    const ndauAmountNum = parseFloat(ndauAmount);
    const timestamp = conversionTimestamp || Math.floor(Date.now() / 1000);

    const payload = createNdauConversionPayload(
      ndauAddress,
      authUser.wallet,
      ndauValidationKey || ndauAddress,
      ndauAmountNum.toString(),
      revoAmount || "0",
      timestamp,
      documentHash || ""
    );

    const payloadYaml = payloadToYaml(payload);

    console.log("[NDAU-CONVERSION] Payload YAML:", payloadYaml);

    const payloadBase64 = btoa(payloadYaml);

    console.log("[NDAU-CONVERSION] Payload base64:", payloadBase64);

    try {
      console.log("[NDAU-CONVERSION] Calling requestSignature...");
      const result = await requestSignature(payloadBase64, ndauAddress);
      console.log("[NDAU-CONVERSION] requestSignature resolved:", result);
      setNdauSignature(result.signature);
      setNdauTimestamp(timestamp);
      toast.success("NDAU account signed successfully");
    } catch (err) {
      console.error("[NDAU-CONVERSION] requestSignature failed:", err);
      toast.error((err as Error).message || "Failed to sign with NDAU account");
    }
  }, [
    ndauAddress,
    authUser?.wallet,
    requestSignature,
    ndauValidationKey,
    ndauBalance,
    revoAmount,
    conversionTimestamp,
    documentHash,
  ]);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: trpc.ndauConversion.submitConversion.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success("Conversion request submitted successfully!");
      setSubmitError(null);
      setCompletedSteps(prev => new Set(prev).add(4));
    },
    onError: error => {
      const errorMessage = error.message || "Unknown error occurred";
      setSubmitError(errorMessage);
      toast.error(`Failed to submit conversion: ${errorMessage}`);
    },
  });

  const handleSubmit = async () => {
    if (!authUser?.wallet || !ndauAddress || !ampedbioSignature || !ndauSignature) {
      toast.error("Please complete all steps before submitting");
      return;
    }

    // Validate NDAU balance locally for UX (backend will fetch actual value)
    const ndauBalanceNum = parseFloat(ndauBalance || "0");

    if (isNaN(ndauBalanceNum) || ndauBalanceNum <= 0) {
      toast.error("Invalid NDAU balance. Please check your NDAU account connection.");
      return;
    }

    // Verify ndau signature before submitting
    const timestamp = ndauTimestamp || conversionTimestamp || Math.floor(Date.now() / 1000);
    const payload = createNdauConversionPayload(
      ndauAddress,
      authUser.wallet,
      ndauValidationKey || ndauAddress,
      ndauBalanceNum.toString(),
      revoAmount || "0",
      timestamp,
      documentHash || ""
    );

    setIsVerifyingSignature(true);
    try {
      const isValid = await verifyNdauSignature(payload, ndauSignature, ndauAddress);
      setSignatureValid(isValid);

      if (!isValid) {
        toast.error("Invalid ndau signature. Please verify your ndau account and try again.");
        setIsVerifyingSignature(false);
        return;
      }
      toast.success("ndau signature verified successfully");
    } catch (error) {
      console.error("Error verifying ndau signature:", error);
      toast.error("Failed to verify ndau signature");
      setIsVerifyingSignature(false);
      return;
    } finally {
      setIsVerifyingSignature(false);
    }

    submitMutation.mutate({
      ndauAddress,
      revoAddress: authUser.wallet,
      ampedbioSignature,
      ndauSignature,
      ndauValidationKey: ndauValidationKey || ndauAddress,
      documentHash: documentHash || "",
      ampedbioTimestamp: ampedbioTimestamp || 0,
      ndauTimestamp: timestamp,
    });
  };

  const handleConvertAnother = () => {
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setNdauBalance("");
    setRevoAmount("");
    setAmpedbioSignature(null);
    setNdauSignature(null);
    setAlreadySubmitted(false);
    setAmpedbioTimestamp(null);
    setNdauTimestamp(null);
    setConversionTimestamp(null);
    setDocumentHash(null);
    setIsCalculatingHash(false);
    toast.info("Reset. You can now connect a different NDAU account.");
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

        {alreadySubmitted && conversionDetails && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  Conversion Already Submitted
                </h3>
                <p className="text-yellow-800 dark:text-yellow-200">
                  This NDAU account has already submitted a conversion request. Below are the
                  details:
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Status:
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    conversionDetails.status === "processed"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      : conversionDetails.status === "pending"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {conversionDetails.status.charAt(0).toUpperCase() +
                    conversionDetails.status.slice(1)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">NDAU Address:</span>
                <span className="font-mono text-xs text-gray-900 dark:text-white break-all max-w-[200px]">
                  {conversionDetails.ndauAddress}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">REVO Address:</span>
                <span className="font-mono text-xs text-gray-900 dark:text-white break-all max-w-[200px]">
                  {conversionDetails.revoAddress}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">NDAU Amount:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {parseFloat(conversionDetails.ndauAmount).toFixed(6)} NDAU
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">REVO Amount:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {conversionDetails.revoAmount} REVO
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Submitted On:</span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {new Date(conversionDetails.createdAt).toLocaleString()}
                </span>
              </div>

              {conversionDetails.txid && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Transaction Hash:
                  </span>
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400 break-all max-w-[200px]">
                    {conversionDetails.txid}
                  </span>
                </div>
              )}

              <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
                  Signature Details:
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-start">
                    <span className="text-gray-500 dark:text-gray-400">AmpedBio Signature:</span>
                    <span
                      className="font-mono text-gray-700 dark:text-gray-300 break-all max-w-[200px]"
                      title={conversionDetails.ampedbioSignature}
                    >
                      {conversionDetails.ampedbioSignature?.slice(0, 10)}...
                      {conversionDetails.ampedbioSignature?.slice(-8)}
                    </span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-gray-500 dark:text-gray-400">NDAU Signature:</span>
                    <span
                      className="font-mono text-gray-700 dark:text-gray-300 break-all max-w-[200px]"
                      title={conversionDetails.ndauSignature}
                    >
                      {conversionDetails.ndauSignature?.slice(0, 10)}...
                      {conversionDetails.ndauSignature?.slice(-8)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {conversionDetails.status === "pending" && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Your conversion is being processed by an admin. You will receive REVO tokens once
                  the process is complete.
                </p>
              </div>
            )}

            {conversionDetails.status === "processed" && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                  Your conversion has been processed successfully. Check your REVO wallet for
                  received tokens.
                </p>
                <Button
                  onClick={() => window.open(`/i/ndau-conversion/receipt/${ndauAddress}`, "_blank")}
                  variant="confirm"
                  size="sm"
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Conversion Receipt
                </Button>
              </div>
            )}

            <div className="mt-4">
              <Button onClick={handleConvertAnother} variant="outline" className="w-full">
                <Wallet className="h-4 w-4 mr-2" />
                Convert with Another Account
              </Button>
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
                    Step 2: Connect NDAU Account
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isNdauConnected
                      ? `Connected: ${ndauAddress?.slice(0, 8)}...${ndauAddress?.slice(-6)}`
                      : "Scan QR code with your NDAU account app"}
                  </p>
                </div>
              </div>
              {completedSteps.has(2) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>
            {!isNdauConnected && !isStepDisabled(2) && (
              <div className="mt-3">
                <NdauConnect buttonText="Connect NDAU Account" />
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

          {/* Step 3: Sign Conversion (merged step with two buttons) */}
          <div
            className={`p-4 rounded-lg border-2 transition-colors ${
              currentStep === 3
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : completedSteps.has(3)
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
            } ${isStepDisabled(3) ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <PenTool className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Step 3: Sign Conversion
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Both wallets must sign the conversion agreement
                  </p>
                </div>
              </div>
              {completedSteps.has(3) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>

            {!isStepDisabled(3) && (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Message you will sign (same for both wallets):
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white font-mono break-words">
                    I agree to convert {ndauBalance || "0"} NDAU to {revoAmount || "0"} REVO (rate:
                    1 NDAU = {NDAU_TO_REVO_RATE} REVO) from {ndauAddress || "..."} to{" "}
                    {authUser?.wallet || "..."}. Document hash: [calculated when signing].
                    Timestamp: [generated when signing]
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    className={`p-4 rounded-lg border-2 ${
                      ampedbioSignature
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Wallet className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      <p className="font-semibold text-gray-900 dark:text-white">AmpedBio Wallet</p>
                      {ampedbioSignature && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    </div>
                    {ampedbioSignature ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Signed: {truncateSignature(ampedbioSignature)}
                      </p>
                    ) : (
                      <>
                        <Button
                          onClick={handleSignAmpedbio}
                          disabled={isAmpedbioSigning || isCalculatingHash || alreadySubmitted}
                          className="w-full"
                        >
                          {isAmpedbioSigning || isCalculatingHash ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {isCalculatingHash ? "Calculating hash..." : "Signing..."}
                            </>
                          ) : (
                            <>
                              <PenTool className="h-4 w-4 mr-2" />
                              Sign with AmpedBio
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>

                  <div
                    className={`p-4 rounded-lg border-2 ${
                      ndauSignature
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Wallet className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      <p className="font-semibold text-gray-900 dark:text-white">NDAU Account</p>
                      {ndauSignature && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    </div>
                    {ndauSignature ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Signed: {truncateSignature(ndauSignature)}
                      </p>
                    ) : (
                      <>
                        <Button
                          onClick={handleSignNdau}
                          disabled={
                            isNdauSigning || alreadySubmitted || !ampedbioSignature || !documentHash
                          }
                          className="w-full"
                        >
                          {isNdauSigning ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Waiting for signature...
                            </>
                          ) : (
                            <>
                              <PenTool className="h-4 w-4 mr-2" />
                              Sign with NDAU
                            </>
                          )}
                        </Button>
                        {isNdauSigning && remainingSeconds > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-2">
                            <Clock className="h-4 w-4" />
                            <span>
                              Time remaining:{" "}
                              <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                                {formatCountdown(remainingSeconds)}
                              </span>
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Submit */}
          <div
            className={`p-4 rounded-lg border-2 transition-colors ${
              currentStep === 4
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : completedSteps.has(4)
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
            } ${isStepDisabled(4) ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Send className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Step 4: Submit Conversion Request
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Review and submit your conversion request
                  </p>
                </div>
              </div>
              {completedSteps.has(4) && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>

            {completedSteps.has(3) && !completedSteps.has(4) && (
              <div className="space-y-4">
                {submitError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-red-900 dark:text-red-100 mb-1">
                          Submission Error
                        </p>
                        <p className="text-sm text-red-800 dark:text-red-200">{submitError}</p>
                      </div>
                      <button
                        onClick={() => setSubmitError(null)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

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
                  <div className="flex justify-between items-start">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Signature Verification:
                    </span>
                    <div className="flex items-center gap-2">
                      {isVerifyingSignature ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                          <span className="text-sm text-blue-600 dark:text-blue-400">
                            Verifying...
                          </span>
                        </div>
                      ) : signatureValid === true ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                            Valid
                          </span>
                        </div>
                      ) : signatureValid === false ? (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                            Invalid
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Pending verification</span>
                      )}
                    </div>
                  </div>
                  {signatureValid === true && ndauAddress && (
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-800 dark:text-green-200">
                        <strong>Verified by:</strong> {ndauAddress.slice(0, 12)}...
                        {ndauAddress.slice(-8)}
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => {
                    setSubmitError(null);
                    handleSubmit();
                  }}
                  disabled={submitMutation.isPending || alreadySubmitted || isVerifyingSignature}
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Conversion
                    </>
                  )}
                </Button>
              </div>
            )}

            {completedSteps.has(4) && (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <p className="text-green-800 dark:text-green-200 font-medium">
                      Conversion request submitted successfully! An admin will process your request.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => window.open(`/i/ndau-conversion/receipt/${ndauAddress}`, "_blank")}
                  variant="confirm"
                  size="sm"
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Conversion Receipt
                </Button>
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
              <span>Connect your NDAU account via QR code</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">3.</span>
              <span>Sign the conversion with both wallets (same message)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">4.</span>
              <span>Submit your conversion request for admin review</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

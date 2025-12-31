import { useState, useEffect } from "react";
import { X, Minus, Plus, Wallet, Loader } from "lucide-react";
import { useRenewal } from "@/hooks/rns/useRenewal";
import { useNameAvailability } from "@/hooks/rns/useNameAvailability";
import { useFeeData, usePublicClient } from "wagmi";
import { toast } from "react-hot-toast";
import { calculateNewExpiryDate, domainName, trimmedDomainName, formatDateTime } from "@/utils/rns";
import { formatEther } from "viem";
import {
  getDurationUnitFromSeconds,
  getStepForUnit,
  getMaxDurationForUnit,
  formatDuration,
} from "@/utils/rns/timeUtils";
// import usePriceFeed from "@/hooks/rns/usePriceFeed";

interface ExtendRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ensName: string;
  currentExpiryDate: number;
}

const ExtendRegistrationModal = ({
  isOpen,
  onClose,
  onSuccess,
  ensName,
  currentExpiryDate,
}: ExtendRegistrationModalProps) => {
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState<"tREVO" | "USD">("tREVO");
  const [isProcessing, setIsProcessing] = useState(false);

  // Duration state using BigInt to match RegisterClient
  const [duration, setDuration] = useState<bigint>(BigInt(0));
  const [durationStep, setDurationStep] = useState<bigint>(BigInt(0));
  const [maxDuration, setMaxDuration] = useState<bigint>(BigInt(0));
  // const [durationUnit, setDurationUnit] = useState<string>('');

  // Get minDuration from useNameAvailability
  const { minDuration, isLoading: availabilityLoading } = useNameAvailability(ensName, duration);
  const { renew, price, isPriceLoading } = useRenewal(ensName, duration);
  const { data: feeData } = useFeeData();
  // const { ethPrice } = usePriceFeed();
  const revoPrice = "$0.00";

  const publicClient = usePublicClient();

  const gweiPrice = feeData ? Number(feeData.gasPrice) / 1e9 : null;
  const estimatedGasFee = 0.0003; // tREVO
  const formattedPrice = price ? formatEther(price) : null;
  const totalEthPrice = formattedPrice ? Number(formattedPrice) + estimatedGasFee : null;
  // const totalUsdPrice =
  //   totalEthPrice && ethPrice ? (totalEthPrice * Number(ethPrice)).toFixed(2) : "0";
  const totalUsdPrice = revoPrice;
  // Initialize duration based on minDuration when it's loaded
  useEffect(() => {
    if (minDuration) {
      // Set duration to minDuration initially
      setDuration(minDuration);

      // Determine the most appropriate duration unit
      const minDurationSeconds = Number(minDuration);
      const unit = getDurationUnitFromSeconds(minDurationSeconds);

      // Set the unit for display purposes
      // setDurationUnit(unit);

      // Set the step size for increment/decrement
      setDurationStep(getStepForUnit(unit));

      // Set maximum allowed duration
      setMaxDuration(getMaxDurationForUnit(unit));
    }
  }, [minDuration]);

  // Handle duration change (similar to RegisterClient)
  const handleDurationChange = (increment: boolean) => {
    if (increment) {
      if (duration + durationStep <= maxDuration) {
        setDuration(duration + durationStep);
      }
    } else {
      const newDuration = duration - durationStep;
      // Don't go below minDuration
      if (minDuration && newDuration >= minDuration) {
        setDuration(newDuration);
      }
    }
  };

  const handleRenewal = async () => {
    try {
      setIsProcessing(true);
      const transactionHash = await renew();

      const receipt = await publicClient?.waitForTransactionReceipt({ hash: transactionHash });

      if (receipt?.status === "success") {
        toast.success("Registration extended successfully");
        onSuccess();
      }

      onClose();
    } catch (error) {
      console.error("Renewal failed:", error);
      toast.error("Failed to extend registration");
    } finally {
      setIsProcessing(false);
    }
  };

  const newExpiryDate = calculateNewExpiryDate(duration, BigInt(currentExpiryDate!));

  if (!isOpen) return null;

  const StepOne = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 overflow-x-hidden">
          Extend <span className="font-semibold sm:font-bold">{trimmedDomainName(ensName)}</span>
        </h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Duration Selector */}
      <div className="rounded-full bg-gray-100 px-2 flex items-center justify-between">
        <button
          onClick={() => handleDurationChange(false)}
          disabled={!minDuration || duration <= minDuration}
          className="h-8 w-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          <Minus className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center py-2">
          <span className="text-blue-500 text-xl sm:text-2xl font-medium">
            {formatDuration(Number(duration))}
          </span>
          {currentExpiryDate && (
            <div className="text-gray-500 text-sm">
              Current expiry: {formatDateTime(currentExpiryDate).date}
            </div>
          )}
        </div>
        <button
          onClick={() => handleDurationChange(true)}
          disabled={duration >= maxDuration}
          className="h-8 w-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Gas Fee Info */}
      <div className="flex items-center justify-between text-gray-500 text-sm">
        <span>⛽ {gweiPrice ? `${gweiPrice.toFixed(2)} Gwei` : "Loading..."}</span>
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded-lg ${currency === "tREVO" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
            onClick={() => setCurrency("tREVO")}
          >
            tREVO
          </button>
          <button
            className={`px-3 py-1 rounded-lg ${currency === "USD" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
            onClick={() => setCurrency("USD")}
          >
            USD
          </button>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-gray-50 rounded-xl border border-[#e2e3e3] p-4 space-y-2">
        <div className="flex justify-between text-gray-600">
          <span>{formatDuration(Number(duration))} extension</span>
          <span>
            {/* {currency === "tREVO"
              ? formattedPrice
                ? `${Number(formattedPrice).toFixed(2)} tREVO`
                : "Loading..."
              : formattedPrice && ethPrice
                ? `$${(Number(formattedPrice) * Number(ethPrice)).toFixed(2)}`
                : "Loading..."} */}

            {currency == "tREVO" ? `${Number(formattedPrice).toFixed(2)} tREVO` : revoPrice}
          </span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Transaction fee</span>
          <span>
            {/* {currency === "tREVO"
              ? `${estimatedGasFee} tREVO`
              : ethPrice
                ? `$${(estimatedGasFee * Number(ethPrice)).toFixed(2)}`
                : "Loading..."} */}

            {currency == "tREVO" ? `${estimatedGasFee} tREVO` : revoPrice}
          </span>
        </div>
        <div className="flex justify-between text-gray-900 font-medium pt-2 border-t border-[#e2e3e3]">
          <span>Estimated total</span>
          <span>
            {currency === "tREVO"
              ? totalEthPrice
                ? `${totalEthPrice.toFixed(4)} tREVO`
                : "Loading..."
              : `${totalUsdPrice}`}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2 px-3 rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          onClick={() => setStep(2)}
          disabled={isPriceLoading || availabilityLoading}
          className="flex-1  py-2 px-3 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPriceLoading || availabilityLoading ? "Loading..." : "Next"}
        </button>
      </div>
    </div>
  );

  const StepTwo = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Confirm Details</h2>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="flex flex-col items-center justify-center gap-2">
        <Wallet className="w-12 h-12 text-blue-500" />
        <p className="text-center text-gray-600">Double check these details before confirming.</p>
      </div>

      {/* Details List */}
      <div className="space-y-3 text-sm sm:text-base">
        <div className="bg-gray-50 border border-[#e2e3e3] rounded-lg p-4 flex justify-between items-start sm:items-center">
          <span className="text-gray-500 flex-shrink-0 font-semibold">Name</span>
          <div className="flex items-center gap-2 max-w-[70%]">
            <p className="text-gray-900 text-right line-clamp-2 break-words break-all hyphens-auto">
              {domainName(ensName)}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border border-[#e2e3e3] rounded-lg p-4 flex justify-between items-center">
          <span className="text-gray-500 font-semibold">Action</span>
          <span className="text-gray-900">Extend registration</span>
        </div>

        <div className="bg-gray-50 border border-[#e2e3e3] rounded-lg p-4 flex justify-between items-center">
          <span className="text-gray-500 font-semibold">Duration</span>
          <div className="text-right">
            <div className="text-gray-900">{formatDuration(Number(duration))}</div>
            <div className="text-sm text-gray-500">New expiry: {newExpiryDate}</div>
          </div>
        </div>

        <div className="bg-gray-50 border border-[#e2e3e3] rounded-lg p-4 flex justify-between items-center">
          <span className="text-gray-500 font-semibold">Cost</span>
          <span className="text-gray-900">
            {totalEthPrice ? `${totalEthPrice.toFixed(4)} tREVO + gas` : "Loading..."}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className="flex-1 py-3 px-4 rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors font-medium"
        >
          Back
        </button>
        <button
          onClick={handleRenewal}
          disabled={isPriceLoading || isProcessing}
          className="flex-1 py-3 px-4 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <Loader className="h-5 w-5 animate-spin" />
          ) : (
            <Wallet className="w-5 h-5" />
          )}
          {isProcessing ? "Processing..." : isPriceLoading ? "Loading..." : "Confirm"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-xl p-6 shadow-lg">
        {step === 1 ? <StepOne /> : <StepTwo />}
      </div>
    </div>
  );
};

export default ExtendRegistrationModal;

import { useEffect } from "react";
import { X, Wallet, Loader2 } from "lucide-react";
import { domainName } from "@/utils/rns";
import { useRegistration } from "@/hooks/rns/useRegistration";
import { useAccount } from "wagmi";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";
import { toast } from "react-hot-toast";
import { useNameDetails } from "@/hooks/rns/useNameDetails";

const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = 3600;
const SECONDS_IN_DAY = 86400;
const SECONDS_IN_WEEK = SECONDS_IN_DAY * 7;
const SECONDS_IN_MONTH = SECONDS_IN_DAY * 30;
const SECONDS_IN_YEAR = SECONDS_IN_DAY * 365;

interface ConfirmRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  duration: number;
  registrationPrice: string;
  ethPrice: string;
}

const ConfirmRegistrationModal = ({
  isOpen,
  onClose,
  name,
  duration,
  registrationPrice,
  ethPrice,
}: ConfirmRegistrationModalProps) => {
  const { navigateToSuccess } = useRNSNavigation();
  const { register, txHash, isSubmitting, isConfirming, isConfirmed, isReceiptError } =
    useRegistration();
  const { refetchAvailability } = useNameDetails(name);
  const { isConnected } = useAccount();

  /**
   * Persist tx data + navigate ONLY after confirmation
   */
  useEffect(() => {
    if (!isConfirmed || !txHash) return;

    localStorage.setItem(
      "transactionData",
      JSON.stringify({
        name,
        duration,
        registrationPrice,
        usdPrice: (Number(registrationPrice) * Number(ethPrice)).toFixed(2),
        transactionHash: txHash,
        timestamp: Date.now(),
      })
    );
    refetchAvailability();
    navigateToSuccess();
  }, [isConfirmed, txHash, name, duration, registrationPrice, ethPrice]);

  /**
   * Receipt failure (revert / dropped tx)
   */
  useEffect(() => {
    if (!isReceiptError) return;
    toast.error("Transaction failed or was reverted");
  }, [isReceiptError]);

  const handleConfirm = async () => {
    try {
      await register(name, BigInt(duration), registrationPrice);
    } catch (err: any) {
      console.error(err);
      toast.error("Registration failed");
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0 hours";

    const years = seconds / SECONDS_IN_YEAR;
    const months = seconds / SECONDS_IN_MONTH;
    const weeks = seconds / SECONDS_IN_WEEK;
    const days = seconds / SECONDS_IN_DAY;
    const hours = seconds / SECONDS_IN_HOUR;

    if (days < 1) {
      const h = Math.floor(hours);
      return `${h} hour${h !== 1 ? "s" : ""}`;
    }
    if (weeks < 1) {
      const d = Math.floor(days);
      return `${d} day${d !== 1 ? "s" : ""}`;
    }
    if (months < 1) {
      const w = Math.floor(weeks);
      return `${w} week${w !== 1 ? "s" : ""}`;
    }
    if (years < 1) {
      const m = Math.floor(months);
      return `${m} month${m !== 1 ? "s" : ""}`;
    }
    const y = Math.floor(years);
    return `${y} year${y !== 1 ? "s" : ""}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/[0.03] backdrop-blur-[8px]">
      <div className="bg-white w-full max-w-[448px] rounded-3xl shadow-lg">
        <div className="p-6 space-y-8">
          {/* Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-[22px] font-semibold text-gray-900">
              {isConfirming ? "Transaction Pending" : "Confirm Details"}
            </h2>

            {!isSubmitting && (
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1 rounded-full hover:bg-gray-50"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex flex-col items-center gap-4">
            {isConfirming ? (
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            ) : (
              <Wallet className="w-12 h-12 text-blue-500" />
            )}

            <p className="text-gray-600 text-center">
              {isConfirming
                ? "Your transaction is being confirmed on-chain."
                : "Double check these details before confirming."}
            </p>
          </div>

          <div className="space-y-2">
            <Detail label="Name" value={domainName(name)} />
            <Detail label="Action" value="Register Name" />
            <Detail label="Duration" value={formatDuration(duration)} />
          </div>

          {/* CTA */}
          {isConnected && !isConfirming && (
            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="w-full py-3 rounded-2xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isSubmitting ? "Confirming…" : "Confirm Transaction"}
            </button>
          )}

          {isConfirming && (
            <p className="text-xs text-gray-500 text-center">
              You can safely close this modal. The transaction will continue.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-gray-50 rounded-2xl p-4 flex justify-between items-start gap-4">
    <span className="text-gray-500 shrink-0">{label}</span>
    <span className="font-medium text-gray-900 text-right break-all min-w-0">{value}</span>
  </div>
);

export default ConfirmRegistrationModal;

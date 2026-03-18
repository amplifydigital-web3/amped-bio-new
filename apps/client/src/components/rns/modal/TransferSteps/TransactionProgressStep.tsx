import React from "react";
import { X } from "lucide-react";
import { TxStatus, TxStep } from "@/types/rns/common";
import { StepState } from "@/hooks/rns/useTransferOwnership";

interface TransactionProgressModalProps {
  onClose: () => void;
  overallStatus: TxStatus;
  embedded?: boolean;
  steps: Record<TxStep, StepState>;
  confirmTransfer: () => void;
}

const TransactionProgressModal: React.FC<TransactionProgressModalProps> = ({
  onClose,
  embedded = false,
  steps,
  overallStatus,
  confirmTransfer,
}) => {
  const renderStatusIcon = (status: TxStatus) => {
    switch (status) {
      case "pending":
        return (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        );

      case "success":
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11.6667 3.5L5.25 9.91667L2.33333 7"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );

      case "error":
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500">
            <X className="h-4 w-4 text-white" />
          </div>
        );

      case "idle":
      default:
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-200">
            <div className="h-3 w-3 rounded-full bg-gray-200" />
          </div>
        );
    }
  };

  /**
   * Must match execution order in useTransferOwnership
   */
  const stepItems: Array<{ step: TxStep; label: string }> = [
    { step: "approval", label: "Approval for name transfer" },
    { step: "transfer", label: "RNS name & Token Ownership Transfer" },
  ];

  const content = (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Confirm transactions</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Info */}
      <div className="mb-6 rounded-lg bg-blue-50 p-4">
        <p className="text-blue-800">
          {overallStatus === "pending"
            ? "We’re processing the required on-chain steps. This may take a few moments."
            : overallStatus === "idle"
              ? "Please confirm the following transactions to proceed with the RNS name transfer."
              : ""}
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {stepItems.map(({ step, label }) => {
          const status = steps[step]?.status ?? "idle";

          return (
            <div key={step} className="flex items-center gap-3">
              {renderStatusIcon(status)}
              <span className="text-lg">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex mt-10">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={overallStatus === "pending"}
        >
          Back
        </button>
        <button
          type="button"
          onClick={confirmTransfer}
          disabled={overallStatus === "pending"}
          className="flex-1 py-3 px-4 bg-blue-500 hover:bg-blue-600 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Confirm
        </button>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg">{content}</div>
    </div>
  );
};

export default TransactionProgressModal;

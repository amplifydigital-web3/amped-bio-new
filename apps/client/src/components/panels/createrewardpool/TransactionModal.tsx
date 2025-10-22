import { X, AlertCircle } from "lucide-react";

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionStep: "confirming" | "confirmed" | "error";
  transactionHash: string | null;
  poolName?: string;
  initialStake?: number;
  creatorFee?: number;
  errorMessage?: string;
}

export function TransactionModal({
  isOpen,
  onClose,
  transactionStep,
  transactionHash,
  poolName,
  initialStake,
  creatorFee,
  errorMessage,
}: TransactionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {transactionStep === "confirming" ? (
          // Confirming Transaction Step
          <>
            <div className="p-6 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 animate-pulse">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Confirming Transaction</h3>
                <p className="text-gray-600">
                  Your reward pool is being created on the blockchain...
                </p>
              </div>

              {/* Transaction Hash */}
              {transactionHash && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="text-sm text-gray-500 mb-1">Transaction Hash</div>
                  <div className="font-mono text-xs text-gray-700 break-all">{transactionHash}</div>
                </div>
              )}

              {/* Progress Animation */}
              <div className="space-y-3">
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-gray-700">Broadcasting transaction...</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse"></div>
                  <span className="text-gray-500">Waiting for confirmation...</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
                  <span className="text-gray-400">Pool deployment...</span>
                </div>
              </div>
            </div>
          </>
        ) : transactionStep === "error" ? (
          // Error State
          <>
            {/* Close Button */}
            <div className="flex justify-end p-4 pb-0">
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-red-900 mb-2">Transaction Failed</h3>
                <p className="text-gray-600">There was an error creating your reward pool.</p>
              </div>

              {/* Transaction Hash */}
              {transactionHash && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                  <div className="text-sm text-gray-500 mb-1">Transaction Hash</div>
                  <div className="font-mono text-xs text-gray-700 break-all">{transactionHash}</div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200 text-left">
                  <div className="text-sm text-red-700 font-medium mb-1">Error Details</div>
                  <div className="text-xs text-red-600 font-mono break-words">{errorMessage}</div>
                </div>
              )}

              {/* Block Explorer Link */}
              {transactionHash && (
                <div className="mb-4">
                  <a
                    href={`https://etherscan.io/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      ></path>
                    </svg>
                    <span>View on Block Explorer</span>
                  </a>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        ) : (
          // Transaction Confirmed Step
          <>
            {/* Close Button */}
            <div className="flex justify-end p-4 pb-0">
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4 animate-bounce">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-green-900 mb-2">Transaction Confirmed!</h3>
                <p className="text-gray-600">
                  Your reward pool has been successfully created and deployed.
                </p>
              </div>

              {/* Transaction Details */}
              <div className="bg-green-50 rounded-lg p-4 mb-4 border border-green-200">
                <div className="text-sm text-green-700 mb-2 font-medium">
                  Pool Created Successfully
                </div>
                <div className="text-xs text-green-600">Pool Name: {poolName}</div>
                <div className="text-xs text-green-600">Initial Stake: {initialStake} REVO</div>
                <div className="text-xs text-green-600">Creator Fee: {creatorFee}%</div>
              </div>

              {/* Block Explorer Link */}
              {transactionHash && (
                <div className="mb-4">
                  <a
                    href={`https://etherscan.io/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      ></path>
                    </svg>
                    <span>View on Block Explorer</span>
                  </a>
                </div>
              )}

              {/* Success Steps */}
              <div className="space-y-2 text-left">
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <span className="text-green-700">Transaction broadcasted</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <span className="text-green-700">Block confirmation received</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <span className="text-green-700">Pool deployed successfully</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
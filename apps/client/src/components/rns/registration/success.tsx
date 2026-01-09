import React, { useState, useEffect } from "react";
import Confetti from "react-confetti";
import { DateTime } from "luxon";
import { scannerURL, trimmedDomainName } from "@/utils/rns";
import { formatDuration } from "@/utils/rns/timeUtils";

interface RegistrationSuccessProps {
  name: string;
  duration: number;
  ethPrice: string;
  usdPrice: string;
  txFeeEth: string;
  txFeeUsd: string;
  txHash: `0x${string}`;
  onViewName: () => void;
  onRegisterAnother: () => void;
}

const formatEthValue = (value: string | undefined): string => {
  if (!value) return "0.0000";
  const numericValue = parseFloat(value.toString().replace(/[^0-9.]/g, ""));
  return isNaN(numericValue) ? "0.0000" : numericValue.toFixed(4);
};

const formatUsdValue = (value: string | undefined): string => {
  if (!value) return "$0.00";
  const numericValue = parseFloat(value.toString().replace(/[^0-9.]/g, ""));
  return isNaN(numericValue) ? "$0.00" : `$${numericValue.toFixed(2)}`;
};

const RegistrationSuccess: React.FC<RegistrationSuccessProps> = ({
  name,
  duration,
  ethPrice,
  usdPrice,
  txFeeEth,
  txFeeUsd,
  txHash,
  onViewName,
  onRegisterAnother,
}) => {
  const [showConfetti, setShowConfetti] = useState(true);
  const [showNotification, setShowNotification] = useState(true);

  // Calculate expiry date using Luxon
  const expiryDate = DateTime.now().plus({ seconds: duration }).toFormat("MMMM dd yyyy");

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    const notifTimer = setTimeout(() => setShowNotification(false), 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(notifTimer);
    };
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-center bg-gray-50 p-4 py-8 overflow-hidden">
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={200}
            gravity={0.3}
          />
        </div>
      )}

      {/* Success Notification */}
      {showNotification && (
        <div className="fixed top-20 right-4 flex items-center gap-3 bg-white rounded-xl p-3 shadow-lg max-w-md z-50">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Transaction Successful</h3>
            <p className="text-xs text-gray-600">
              Your &#34;Register name&#34; transaction was successful
            </p>
          </div>
          <a
            href={scannerURL("tx", txHash)}
            target="_blank"
            className="text-blue-500 text-xs whitespace-nowrap"
          >
            View on Explorer
          </a>
        </div>
      )}

      {/* Main Content - Responsive container */}
      <div className="w-full max-w-md lg:max-w-2xl bg-white rounded-2xl shadow-md overflow-hidden">
        {/* Header */}
        <div className="w-full text-center p-6 pt-8">
          <h1 className="text-3xl font-bold mb-2">Congratulations!</h1>
          <p className="text-base text-gray-700">
            You are now the owner of{" "}
            <span className="text-blue-500">{trimmedDomainName(name)}</span>
          </p>
        </div>

        {/* Content area - Different layout on mobile vs desktop */}
        <div className="flex flex-col items-center lg:items-start lg:flex-row p-4 lg:p-6 gap-6">
          {/* Domain Card - Smaller on mobile, properly sized on desktop */}
          <div className="w-64 h-64 sm:w-72 sm:h-72 lg:w-64 lg:h-64 bg-gradient-to-br from-blue-500 to-blue-300 rounded-2xl flex flex-col items-center justify-center text-white p-4">
            <div className="w-12 h-12 mb-4">
              <svg viewBox="0 0 32 32" className="w-full h-full">
                <path fill="currentColor" d="M16 0L32 16L16 32L0 16L16 0Z" />
              </svg>
            </div>
            <div className="text-lg font-medium text-center w-full px-4">
              <span className="block truncate max-w-full">{trimmedDomainName(name)}</span>
            </div>
          </div>

          {/* Registration details - Below domain card on mobile, right side on desktop */}
          <div className="w-full lg:w-72 border border-gray-100 rounded-xl">
            <div className="grid grid-cols-1 divide-y divide-gray-100">
              <div className="p-4 text-center sm:hidden">
                <div className="flex justify-between">
                  <div className="w-1/2 border-r border-gray-100">
                    <div className="text-gray-500 text-xs mb-1">
                      {formatDuration(Number(duration))}
                    </div>
                    <div className="font-medium text-base">{formatEthValue(ethPrice)} tREVO</div>
                    <div className="text-xs text-gray-500">{formatUsdValue(usdPrice)}</div>
                  </div>
                  <div className="w-1/2">
                    <div className="text-gray-500 text-xs mb-1">Transaction fees</div>
                    <div className="font-medium text-base">{formatEthValue(txFeeEth)} tREVO</div>
                    <div className="text-xs text-gray-500">{formatUsdValue(txFeeUsd)}</div>
                  </div>
                </div>
              </div>

              {/* Desktop: Registration Info (hidden on mobile) */}
              <div className="p-4 text-center hidden sm:block">
                <div className="text-gray-500 text-xs mb-1">{formatDuration(Number(duration))}</div>
                <div className="font-medium text-base">{formatEthValue(ethPrice)} tREVO</div>
                <div className="text-xs text-gray-500">{formatUsdValue(usdPrice)}</div>
              </div>

              {/* Desktop: Transaction Fees (hidden on mobile) */}
              <div className="p-4 text-center hidden sm:block">
                <div className="text-gray-500 text-xs mb-1">Transaction fees</div>
                <div className="font-medium text-base">{formatEthValue(txFeeEth)} tREVO</div>
                <div className="text-xs text-gray-500">{formatUsdValue(txFeeUsd)}</div>
              </div>

              {/* Expiration */}
              <div className="p-4 text-center">
                <div className="text-gray-500 text-xs mb-1">Name expires</div>
                <div className="font-medium text-base">{expiryDate}</div>
                {/* <button className="text-blue-500 text-xs flex items-center justify-center mx-auto mt-1">
                  <svg
                    className="w-3 h-3 mr-1"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  Set reminder
                </button> */}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 lg:p-6 lg:pt-2">
          <button
            onClick={onRegisterAnother}
            className="w-full py-3 mb-4 rounded-xl text-blue-500 bg-blue-50 font-medium text-sm"
          >
            Register another
          </button>
          <button
            onClick={onViewName}
            className="w-full py-3 mb-4 rounded-xl bg-blue-500 text-white font-medium text-sm"
          >
            View name
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegistrationSuccess;

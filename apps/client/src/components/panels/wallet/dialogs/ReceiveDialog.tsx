import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";
import { QRCodeSVG } from "qrcode.react";

interface ReceiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ReceiveDialog({ open, onOpenChange }: ReceiveDialogProps) {
  const [copied, setCopied] = useState(false);
  const { address } = useAccount();

  // Format address to show only first and last few characters
  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Copy wallet address to clipboard
  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl p-0">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Receive Assets</h2>
          </div>

          {/* Modal Content */}
          <div className="p-6 space-y-6">
            {/* Wallet Address Display */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Wallet Address
              </label>
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={address || ""}
                    readOnly
                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-700 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleCopy}
                  className="p-3 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200 flex-shrink-0"
                  title="Copy wallet address"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* QR Code */}
            <div className="text-center">
              <div className="inline-block p-4 bg-white rounded-xl border-2 border-gray-100 shadow-sm">
                {address ? (
                  <QRCodeSVG
                    value={address}
                    size={160}
                    className="block mx-auto"
                  />
                ) : (
                  <div className="text-gray-400">No address available</div>
                )}
              </div>
            </div>

            {/* Instructional Text */}
            <div className="text-center">
              <p className="text-sm text-gray-600 leading-relaxed">
                Scan this code or copy your address to receive tokens or NFTs to this wallet.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ReceiveDialog;

import { CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { ArrowDownLeft, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";

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
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="bg-purple-100 p-2 rounded-full">
                <ArrowDownLeft className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Receive REVO</h2>
                <p className="text-sm text-gray-500">Share your address to receive funds</p>
              </div>
            </div>
          </div>
        </DialogHeader>
        <CardContent className="text-center">
          <div className="mb-6 bg-purple-50 p-6 rounded-xl">
            <div className="bg-white p-3 rounded-lg mb-4 mx-auto w-48 h-48 flex items-center justify-center">
              {address ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(address)}`}
                  alt="Wallet Address QR Code"
                  width={160}
                  height={160}
                  className="mx-auto"
                />
              ) : (
                <div className="text-gray-400">No address available</div>
              )}
            </div>
            {address && (
              <div className="flex flex-col items-center">
                <span className="font-mono text-sm text-gray-500 mb-2">Wallet Address:</span>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm bg-white p-2 rounded border border-gray-200">
                    {formatAddress(address)}
                  </span>
                  <div
                    onClick={handleCopy}
                    className="cursor-pointer h-9 w-9 flex items-center justify-center rounded-md hover:bg-gray-100"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-500">
            <p>Send only REVO tokens to this address.</p>
            <p className="mt-1">Sending other tokens may result in permanent loss.</p>
          </div>
        </CardContent>
      </DialogContent>
    </Dialog>
  );
}

export default ReceiveDialog;

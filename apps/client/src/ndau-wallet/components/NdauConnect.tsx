import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNdauWallet } from "../contexts/NdauWalletContext";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wallet, X, Loader2, CheckCircle2 } from "lucide-react";

interface NdauConnectProps {
  buttonText?: string;
  connectedText?: (address: string) => string;
}

export function NdauConnect({
  buttonText = "Connect NDAU Wallet",
  connectedText,
}: NdauConnectProps) {
  const { walletAddress, socket, isConnecting, connect, disconnect } = useNdauWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [socketId, setSocketId] = useState<string | undefined>(undefined);

  const isConnected = !!walletAddress;

  useEffect(() => {
    if (socket?.id) {
      setSocketId(socket.id);
    }
  }, [socket]);

  const handleOpen = useCallback(() => {
    if (!socket) {
      connect();
    }
    setIsModalOpen(true);
  }, [socket, connect]);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const qrCodeValue = JSON.stringify({
    website_socket_id: socketId,
    website_url: window.location.href,
    website_title: document.title || "Amped Bio",
    request: "login",
    action: "login",
  });

  const displayText = connectedText
    ? connectedText(walletAddress)
    : `${walletAddress.slice(0, 10)}...`;

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="font-mono text-sm text-gray-900 dark:text-white">{displayText}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleDisconnect}>
          <X className="h-4 w-4 mr-1" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button onClick={handleOpen} variant="default">
        <Wallet className="h-4 w-4 mr-2" />
        {buttonText}
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect with NDAU Wallet</DialogTitle>
            <DialogDescription>
              Scan the QR code with your ndau wallet app to connect
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6">
            {isConnecting && !socketId ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connecting to server...
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG value={qrCodeValue} size={218} includeMargin />
                </div>
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  Scan QR code with ndau wallet app
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default NdauConnect;

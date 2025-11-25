import { X, Send, DollarSign, Trophy, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NFTModalProps {
  isOpen: boolean;
  onClose: () => void;
  nft: {
    id: string;
    name: string;
    collection: string;
    image: string;
    floorPrice: number;
    tokenId?: string;
    description?: string;
  } | null;
}

export default function NFTModal({ isOpen, onClose, nft }: NFTModalProps) {
  if (!nft) return null;

  const handleSend = () => {
    console.log("Send NFT:", nft.name);
    // Implementation for sending this specific NFT
    // This would typically open the send modal pre-filled with this NFT
  };

  const handleSell = () => {
    console.log("Sell NFT:", nft.name);
    // Implementation for selling/listing this NFT
    // This would typically open a marketplace listing flow
  };

  const handleUseAsPrize = () => {
    console.log("Use NFT as prize:", nft.name);
    // Implementation for using this NFT as a prize in reward pools
    // This would typically open a confirmation modal or reward pool creation flow
  };

  const handleViewOnExplorer = () => {
    // In a real app, this would use the actual contract address and token ID
    // For demo purposes, we'll use a placeholder Etherscan URL
    const contractAddress = "0x1234567890abcdef1234567890abcdef12345678"; // Mock contract address
    const explorerUrl = `https://etherscan.io/token/${contractAddress}?a=${nft.tokenId || nft.id}`;
    window.open(explorerUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">NFT Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* NFT Image */}
          <div className="text-center">
            <div className="inline-block rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <img src={nft.image} alt={nft.name} className="w-full max-w-sm h-auto object-cover" />
            </div>
          </div>

          {/* NFT Information */}
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-gray-900">{nft.name}</h3>
            <p className="text-lg text-gray-600">{nft.collection}</p>

            {/* Metadata */}
            <div className="flex items-center justify-center space-x-6 text-sm text-gray-500 pt-2">
              {nft.tokenId && (
                <div>
                  <span className="font-medium">Token ID:</span> #{nft.tokenId}
                </div>
              )}
              <div>
                <span className="font-medium">Floor Price:</span> {nft.floorPrice} ETH
              </div>
            </div>

            {/* Description */}
            {nft.description && (
              <div className="pt-4">
                <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
                  {nft.description}
                </p>
              </div>
            )}

            {/* Block Explorer Link */}
            <div className="pt-4">
              <button
                onClick={handleViewOnExplorer}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                <span>View on Block Explorer</span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
            {/* Send Button */}
            <button
              onClick={handleSend}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>

            {/* Sell Button */}
            <button
              onClick={handleSell}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-all duration-200"
            >
              <DollarSign className="w-4 h-4" />
              <span>Sell</span>
            </button>

            {/* Use as Prize Button */}
            <button
              onClick={handleUseAsPrize}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-lg font-medium transition-all duration-200"
            >
              <Trophy className="w-4 h-4" />
              <span>Use as Prize</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

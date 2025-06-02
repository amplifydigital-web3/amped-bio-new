import { Dialog } from "../ui/Dialog";
import { X, Coins, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { CreateWalletButton } from "../connect/components/smartwallet/CreateWalletButton";

interface WalletModalProps {
  onClose: () => void;
}

export function WalletModal({ onClose }: WalletModalProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  // Placeholder for holdings and NFTs
  const holdings = [
    { symbol: "ETH", amount: 1.234, icon: <Coins className="w-6 h-6 text-yellow-500" /> },
    { symbol: "USDC", amount: 250, icon: <Coins className="w-6 h-6 text-blue-500" /> },
  ];
  const nfts = [
    { name: "CryptoKitty #123", image: "https://placekitten.com/80/80" },
    { name: "Amped NFT #42", image: "https://placehold.co/80x80" },
  ];

  return (
    <Dialog open onClose={onClose}>
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl p-8 relative border border-yellow-200">
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
          onClick={onClose}
        >
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-yellow-600 mb-2 flex items-center gap-2">
          <Coins className="w-7 h-7" /> My Wallet
        </h2>
        <p className="text-gray-600 mb-6">Connect your crypto wallet to view your assets and NFTs.</p>
        {!walletAddress ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CreateWalletButton handleSuccess={setWalletAddress} handleError={console.error} />
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Holdings</h3>
              <div className="grid grid-cols-2 gap-4">
                {holdings.map((h, i) => (
                  <div key={i} className="flex items-center bg-yellow-50 rounded-lg p-3 gap-3 shadow">
                    {h.icon}
                    <div>
                      <div className="font-bold text-lg">{h.amount}</div>
                      <div className="text-sm text-gray-700">{h.symbol}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">NFTs</h3>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {nfts.map((nft, i) => (
                  <div key={i} className="flex flex-col items-center bg-gray-50 rounded-lg p-2 min-w-[100px] shadow">
                    <img src={nft.image} alt={nft.name} className="w-16 h-16 rounded mb-2 border border-yellow-200" />
                    <span className="text-xs text-gray-700 text-center font-medium">{nft.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

import React, { useState } from 'react';
import { Download, Lock } from 'lucide-react';
import type { MarketplaceTheme } from '../../../types/editor';
import { NFTVerificationModal } from './NFTVerificationModal';
import { StarRating } from './StarRating';

interface ThemeCardProps {
  theme: MarketplaceTheme;
  onApply: (theme: MarketplaceTheme['theme']) => void;
}

export function ThemeCard({ theme, onApply }: ThemeCardProps) {
  const [showVerification, setShowVerification] = useState(false);

  const handleApply = () => {
    if (theme.locked && theme.nftRequirement) {
      setShowVerification(true);
    } else {
      onApply(theme.theme);
    }
  };

  const handleVerify = async () => {
    // In a real app, implement wallet connection and NFT verification here
    console.log('Verifying NFT ownership...');
    setShowVerification(false);
  };

  return (
    <>
      <div className="bg-white rounded-lg overflow-hidden border border-gray-200 hover:border-blue-500 transition-colors group">
        <div className="aspect-video relative overflow-hidden">
          <img
            src={theme.thumbnail}
            alt={theme.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
            >
              {theme.locked && <Lock className="w-4 h-4" />}
              <span>{theme.locked ? 'Unlock Theme' : 'Apply Theme'}</span>
            </button>
          </div>
          {theme.locked && (
            <div className="absolute top-2 right-2 bg-black/50 px-2 py-1 rounded-full flex items-center space-x-1">
              <Lock className="w-3 h-3 text-white" />
              <span className="text-xs text-white">NFT Required</span>
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-medium text-gray-900 truncate">{theme.name}</h3>
          <p className="text-sm text-gray-500 line-clamp-2 mt-1">
            {theme.description}
          </p>
          <div className="flex items-center justify-between mt-3">
            <StarRating rating={theme.rating} size="sm" />
            <div className="flex items-center space-x-1 text-sm text-gray-500">
              <Download className="w-4 h-4" />
              <span>{theme.downloads.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {showVerification && theme.nftRequirement && (
        <NFTVerificationModal
          nftRequirement={theme.nftRequirement}
          onClose={() => setShowVerification(false)}
          onVerify={handleVerify}
        />
      )}
    </>
  );
}
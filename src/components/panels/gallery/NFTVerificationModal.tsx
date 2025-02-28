import React from 'react';
import { Lock, ExternalLink } from 'lucide-react';
import type { NFTRequirement } from '../../../types/editor';

interface NFTVerificationModalProps {
  nftRequirement: NFTRequirement;
  onClose: () => void;
  onVerify: () => void;
}

export function NFTVerificationModal({ nftRequirement, onClose, onVerify }: NFTVerificationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mx-auto">
          <Lock className="w-8 h-8 text-blue-600" />
        </div>
        
        <h3 className="text-xl font-semibold text-center mt-4">
          NFT Required
        </h3>
        
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <img
              src={nftRequirement.image}
              alt={nftRequirement.name}
              className="w-12 h-12 rounded-lg"
            />
            <div>
              <h4 className="font-medium">{nftRequirement.name}</h4>
              <p className="text-sm text-gray-500">Min. Balance: {nftRequirement.minBalance}</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-600 mt-4">
          This theme requires you to own the NFT to use it. You can either verify your ownership or purchase the NFT.
        </p>

        <div className="flex flex-col space-y-3 mt-6">
          <button
            onClick={onVerify}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Verify Ownership
          </button>
          
          <a
            href={nftRequirement.marketplace}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center space-x-2"
          >
            <span>Purchase NFT ({nftRequirement.price})</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
import React from "react";
import { Image } from "lucide-react";

const NFTsTab: React.FC = () => {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Image className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No NFTs found</h3>
      <p className="text-gray-500 mb-6 max-w-sm mx-auto">
        Your NFT collection will appear here once you have NFTs.
      </p>
    </div>
  );
};

export default NFTsTab;

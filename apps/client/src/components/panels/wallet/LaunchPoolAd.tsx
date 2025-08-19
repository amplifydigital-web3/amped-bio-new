import { Trophy, Info, TrendingUp } from "lucide-react";
import React from "react";

// import { Container } from './styles';

const LaunchPoolAd: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Trophy className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Reward Pools</h3>
            <div className="text-sm text-gray-600 mt-1 space-y-1">
              <p>Create and manage staking-based reward pools for your community.</p>
              <p>Distribute tokens, NFTs, or access based on onchain participation.</p>
            </div>
          </div>
        </div>

        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between">
        <div className="flex items-center space-x-4 mb-3 sm:mb-0">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span>Boost community engagement</span>
          </div>
        </div>

        <div className="w-full sm:w-auto flex justify-center">
          <button
            disabled
            className="relative px-4 py-2 bg-purple-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2 opacity-60 cursor-not-allowed"
          >
            <span className="absolute -top-2 -right-2 text-xs bg-yellow-200 text-yellow-800 rounded px-2 py-0.5 shadow-sm pointer-events-none select-none">
              Soon
            </span>
            <Trophy className="w-4 h-4" />
            <span>Launch Pool</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LaunchPoolAd;

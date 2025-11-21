import { useEditor } from "../../../contexts/EditorContext";
// import { CreatorPoolDetail } from "../rewardpools/CreatorPoolDetail";
import { CoinsIcon, Users, TrendingUp, Crown } from "lucide-react";

interface Pool {
  id: string;
  name: string; // Blockchain pool name (primary)
  creator: {
    name: string;
    avatar: string;
    verified: boolean;
  };
  totalStaked: number;
  tokenPrice: number;
  fans: number;
  apr: number;
  topStaker: {
    name: string;
    avatar: string;
    stakedAmount: number;
  };
}

const mockPools: Pool[] = [
  {
    id: "1",
    name: "Web3 Development Pool",
    creator: {
      name: "Alex Thompson",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop",
      verified: true,
    },
    totalStaked: 2500000,
    tokenPrice: 2.34,
    fans: 850,
    apr: 12.5,
    topStaker: {
      name: "crypto_whale.eth",
      avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=48&h=48&fit=crop",
      stakedAmount: 250000,
    },
  },
  {
    id: "2",
    name: "NFT Creators Pool",
    creator: {
      name: "Emma Digital",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop",
      verified: true,
    },
    totalStaked: 1800000,
    tokenPrice: 1.85,
    fans: 620,
    apr: 8.5,
    topStaker: {
      name: "nft_collector.eth",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop",
      stakedAmount: 180000,
    },
  },
  {
    id: "3",
    name: "DeFi Innovators",
    creator: {
      name: "Sam Blockchain",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&h=64&fit=crop",
      verified: true,
    },
    totalStaked: 3200000,
    tokenPrice: 3.12,
    fans: 920,
    apr: 15.2,
    topStaker: {
      name: "defi_master.eth",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop",
      stakedAmount: 320000,
    },
  },
];

export function LeaderboardPanel() {
  const { selectedPoolId, setSelectedPoolId } = useEditor();

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  // if (selectedPoolId) {
  //   return <CreatorPoolDetail poolId={selectedPoolId} onBack={() => setSelectedPoolId(null)} />;
  // }

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Creator Pool Leaderboard</h2>
        <p className="text-sm text-gray-500">Explore and compare different creator pools</p>
      </div>

      <div className="space-y-6">
        {mockPools.map(pool => (
          <div
            key={pool.id}
            className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-blue-500 transition-colors"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <img
                    src={pool.creator.avatar}
                    alt={pool.creator.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{pool.name}</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">by {pool.creator.name}</span>
                      {pool.creator.verified && (
                        <div className="bg-blue-500 rounded-full p-0.5">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top Staker Badge */}
                <div className="flex items-center space-x-2 bg-yellow-50 px-3 py-2 rounded-lg">
                  <Crown className="w-4 h-4 text-yellow-600" />
                  <div>
                    <p className="text-xs text-yellow-600 font-medium">Top Staker</p>
                    <div className="flex items-center space-x-2">
                      <img
                        src={pool.topStaker.avatar}
                        alt={pool.topStaker.name}
                        className="w-4 h-4 rounded-full"
                      />
                      <p className="text-sm text-gray-700">{pool.topStaker.name}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <CoinsIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Staked</p>
                    <p className="font-medium">{formatUSD(pool.totalStaked * pool.tokenPrice)}</p>
                    <p className="text-xs text-gray-500">{formatNumber(pool.totalStaked)} tokens</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">APR</p>
                    <p className="font-medium">{pool.apr}%</p>
                    <p className="text-xs text-gray-500">Annual yield</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fans</p>
                    <p className="font-medium">
                      {pool.fans}
                    </p>
                    <p className="text-xs text-gray-500">
                      Active supporters
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={() => setSelectedPoolId(pool.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    View Pool
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

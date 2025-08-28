import React, { useState } from 'react';
import { Trophy, Gift, Users, Star, Clock, Plus, TrendingUp, Calendar, Coins, Target } from 'lucide-react';

interface RewardPool {
  id: string;
  title: string;
  description: string;
  totalReward: number;
  currency: string;
  participants: number;
  maxParticipants: number;
  endDate: string;
  status: 'active' | 'upcoming' | 'ended';
  category: 'staking' | 'social' | 'trading' | 'community';
  requirements: string[];
  createdBy: string;
  image?: string;
}

interface UserReward {
  id: string;
  title: string;
  amount: number;
  currency: string;
  earnedDate: string;
  status: 'claimed' | 'pending' | 'available';
  poolId: string;
}

export default function RewardsPage() {
  const [activeTab, setActiveTab] = useState<'pools' | 'my-rewards' | 'create'>('pools');

  // Mock data for reward pools
  const rewardPools: RewardPool[] = [
    {
      id: '1',
      title: 'REVO Staking Champions',
      description: 'Stake 1000+ REVO tokens for 30 days and earn bonus rewards based on your staking duration.',
      totalReward: 50000,
      currency: 'REVO',
      participants: 247,
      maxParticipants: 500,
      endDate: '2025-02-15',
      status: 'active',
      category: 'staking',
      requirements: ['Stake minimum 1000 REVO', 'Hold for 30 days', 'Complete KYC'],
      createdBy: 'Amped.Bio Team',
      image: 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=400'
    },
    {
      id: '2',
      title: 'Social Media Engagement',
      description: 'Share your profile, refer friends, and engage with the community to earn exclusive NFT rewards.',
      totalReward: 25,
      currency: 'NFTs',
      participants: 892,
      maxParticipants: 1000,
      endDate: '2025-01-31',
      status: 'active',
      category: 'social',
      requirements: ['Share profile 5 times', 'Refer 3 friends', 'Post weekly updates'],
      createdBy: 'Community DAO',
      image: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=400'
    },
    {
      id: '3',
      title: 'Trading Volume Challenge',
      description: 'Achieve $10,000+ in trading volume this month and win ETH prizes.',
      totalReward: 10,
      currency: 'ETH',
      participants: 156,
      maxParticipants: 200,
      endDate: '2025-01-31',
      status: 'active',
      category: 'trading',
      requirements: ['$10,000+ trading volume', 'Minimum 20 trades', 'Verified account'],
      createdBy: 'TradingPro',
      image: 'https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg?auto=compress&cs=tinysrgb&w=400'
    },
    {
      id: '4',
      title: 'Creator Spotlight',
      description: 'Submit your best content and get featured. Top creators win USDC rewards.',
      totalReward: 5000,
      currency: 'USDC',
      participants: 67,
      maxParticipants: 100,
      endDate: '2025-02-28',
      status: 'upcoming',
      category: 'community',
      requirements: ['Submit original content', 'Get 100+ likes', 'Follow guidelines'],
      createdBy: 'CreatorDAO',
      image: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=400'
    }
  ];

  // Mock data for user rewards
  const userRewards: UserReward[] = [
    {
      id: '1',
      title: 'Early Adopter Bonus',
      amount: 500,
      currency: 'REVO',
      earnedDate: '2025-01-10',
      status: 'available',
      poolId: '1'
    },
    {
      id: '2',
      title: 'Social Engagement NFT',
      amount: 1,
      currency: 'NFT',
      earnedDate: '2025-01-08',
      status: 'claimed',
      poolId: '2'
    },
    {
      id: '3',
      title: 'Staking Milestone',
      amount: 250,
      currency: 'REVO',
      earnedDate: '2025-01-05',
      status: 'pending',
      poolId: '1'
    }
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'staking': return <Coins className="w-4 h-4" />;
      case 'social': return <Users className="w-4 h-4" />;
      case 'trading': return <TrendingUp className="w-4 h-4" />;
      case 'community': return <Star className="w-4 h-4" />;
      default: return <Gift className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'staking': return 'bg-blue-100 text-blue-700';
      case 'social': return 'bg-green-100 text-green-700';
      case 'trading': return 'bg-purple-100 text-purple-700';
      case 'community': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'upcoming': return 'bg-blue-100 text-blue-700';
      case 'ended': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getRewardStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700';
      case 'claimed': return 'bg-gray-100 text-gray-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleJoinPool = (poolId: string) => {
    console.log('Joining pool:', poolId);
    // Implementation for joining a reward pool
  };

  const handleClaimReward = (rewardId: string) => {
    console.log('Claiming reward:', rewardId);
    // Implementation for claiming a reward
  };

  const handleCreatePool = () => {
    console.log('Creating new reward pool');
    // Implementation for creating a new reward pool
  };

  const renderPools = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reward Pools</h2>
          <p className="text-gray-600 mt-1">Join pools and complete challenges to earn rewards</p>
        </div>
        <button
          onClick={handleCreatePool}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Create Pool</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rewardPools.map((pool) => (
          <div key={pool.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
            {pool.image && (
              <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative overflow-hidden">
                <img
                  src={pool.image}
                  alt={pool.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-20"></div>
              </div>
            )}
            
            <div className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getCategoryColor(pool.category)}`}>
                    {getCategoryIcon(pool.category)}
                    <span className="capitalize">{pool.category}</span>
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(pool.status)}`}>
                    {pool.status}
                  </span>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">{pool.title}</h3>
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">{pool.description}</p>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Total Reward</span>
                  <span className="font-semibold text-gray-900">
                    {pool.totalReward.toLocaleString()} {pool.currency}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Participants</span>
                  <span className="font-semibold text-gray-900">
                    {pool.participants}/{pool.maxParticipants}
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(pool.participants / pool.maxParticipants) * 100}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Ends</span>
                  <span className="font-semibold text-gray-900 flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(pool.endDate).toLocaleDateString()}</span>
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Requirements:</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                  {pool.requirements.slice(0, 2).map((req, index) => (
                    <li key={index} className="flex items-center space-x-2">
                      <Target className="w-3 h-3 text-gray-400" />
                      <span>{req}</span>
                    </li>
                  ))}
                  {pool.requirements.length > 2 && (
                    <li className="text-gray-400">+{pool.requirements.length - 2} more...</li>
                  )}
                </ul>
              </div>

              <button
                onClick={() => handleJoinPool(pool.id)}
                disabled={pool.status === 'ended'}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  pool.status === 'ended'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : pool.status === 'upcoming'
                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {pool.status === 'ended' ? 'Pool Ended' : pool.status === 'upcoming' ? 'Coming Soon' : 'Join Pool'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderMyRewards = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">My Rewards</h2>
        <p className="text-gray-600 mt-1">Track and claim your earned rewards</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userRewards.map((reward) => (
          <div key={reward.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{reward.title}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getRewardStatusColor(reward.status)}`}>
                {reward.status}
              </span>
            </div>

            <div className="mb-4">
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {reward.amount} {reward.currency}
              </div>
              <div className="text-sm text-gray-500 flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Earned {new Date(reward.earnedDate).toLocaleDateString()}</span>
              </div>
            </div>

            {reward.status === 'available' && (
              <button
                onClick={() => handleClaimReward(reward.id)}
                className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors duration-200"
              >
                Claim Reward
              </button>
            )}

            {reward.status === 'pending' && (
              <div className="w-full py-2 px-4 bg-yellow-50 text-yellow-700 rounded-lg text-center text-sm font-medium">
                Processing...
              </div>
            )}

            {reward.status === 'claimed' && (
              <div className="w-full py-2 px-4 bg-gray-50 text-gray-500 rounded-lg text-center text-sm font-medium">
                Already Claimed
              </div>
            )}
          </div>
        ))}
      </div>

      {userRewards.length === 0 && (
        <div className="text-center py-12">
          <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No rewards yet</h3>
          <p className="text-gray-500 mb-6">Join reward pools to start earning!</p>
          <button
            onClick={() => setActiveTab('pools')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
          >
            Browse Pools
          </button>
        </div>
      )}
    </div>
  );

  const renderCreatePool = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Create Reward Pool</h2>
        <p className="text-gray-600 mt-1">Set up a new reward pool for your community</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="text-center py-12">
          <Plus className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Pool Creation Coming Soon</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            We're working on an intuitive pool creation interface. Soon you'll be able to create custom reward pools with flexible requirements and rewards.
          </p>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4" />
              <span>Token Rewards</span>
            </div>
            <div className="flex items-center space-x-2">
              <Gift className="w-4 h-4" />
              <span>NFT Prizes</span>
            </div>
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4" />
              <span>Custom Requirements</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      {/* Header with Stats */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-900">4</div>
                <div className="text-sm text-blue-700">Active Pools</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <Gift className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-900">750</div>
                <div className="text-sm text-green-700">REVO Earned</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-900">1,362</div>
                <div className="text-sm text-purple-700">Total Participants</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8">
        <nav className="flex space-x-8 border-b border-gray-200">
          {[
            { id: 'pools', label: 'Reward Pools', icon: Trophy },
            { id: 'my-rewards', label: 'My Rewards', icon: Gift },
            { id: 'create', label: 'Create Pool', icon: Plus }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'pools' && renderPools()}
      {activeTab === 'my-rewards' && renderMyRewards()}
      {activeTab === 'create' && renderCreatePool()}
    </div>
  );
}
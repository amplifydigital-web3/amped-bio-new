import React from 'react';
import { CoinsIcon, Users, Clock, TrendingUp, ExternalLink } from 'lucide-react';

interface Pool {
  id: string;
  name: string;
  description: string;
  tokenAddress: string;
  rewardRate: number;
  lockPeriod: number;
  totalStaked: number;
  participants: number;
  maxParticipants: number;
  status: 'active' | 'full' | 'ended';
}

const mockPools: Pool[] = [
  {
    id: '1',
    name: 'Creator Season 1',
    description: 'Stake tokens to earn rewards and exclusive content access',
    tokenAddress: '0x1234...5678',
    rewardRate: 5,
    lockPeriod: 30,
    totalStaked: 50000,
    participants: 150,
    maxParticipants: 1000,
    status: 'active',
  },
  {
    id: '2',
    name: 'VIP Supporters',
    description: 'Premium staking pool for dedicated supporters',
    tokenAddress: '0x9876...4321',
    rewardRate: 8,
    lockPeriod: 90,
    totalStaked: 100000,
    participants: 50,
    maxParticipants: 50,
    status: 'full',
  },
];

export function PoolList() {
  return (
    <div className="space-y-6">
      {mockPools.map((pool) => (
        <div
          key={pool.id}
          className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-blue-500 transition-colors"
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{pool.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{pool.description}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  pool.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : pool.status === 'full'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CoinsIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Staked</p>
                  <p className="font-medium">{pool.totalStaked.toLocaleString()} Tokens</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">APR</p>
                  <p className="font-medium">{pool.rewardRate}%</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Participants</p>
                  <p className="font-medium">
                    {pool.participants} / {pool.maxParticipants}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Lock Period</p>
                  <p className="font-medium">{pool.lockPeriod} Days</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <span>Contract:</span>
                <a
                  href={`https://etherscan.io/address/${pool.tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center hover:text-blue-600"
                >
                  {pool.tokenAddress}
                  <ExternalLink className="w-4 h-4 ml-1" />
                </a>
              </div>

              <div className="flex space-x-3">
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  disabled={pool.status !== 'active'}
                >
                  Stake Tokens
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
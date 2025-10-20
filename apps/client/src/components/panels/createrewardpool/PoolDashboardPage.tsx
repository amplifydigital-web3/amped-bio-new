import React, { useState } from 'react';
import { Trophy, Users, Coins, TrendingUp, Crown, Star, Medal, Award, Eye, ChevronLeft, ChevronRight, Activity, ArrowUp, ArrowDown, Gift, Clock } from 'lucide-react';
import PoolDetailsModal from '../wallet/PoolDetailsModal';

interface Fan {
  id: string;
  username: string;
  avatar: string;
  stakedAmount: number;
  joinDate: string;
  tier: number;
  totalRewards: number;
}

interface PoolActivity {
  id: string;
  type: 'stake' | 'unstake' | 'claim';
  user: string;
  avatar: string;
  amount: number;
  currency: string;
  timestamp: string;
  txHash?: string;
}

export default function DashboardPage() {
  const [showUSD, setShowUSD] = useState(false);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
  const fansPerPage = 10;
  const activitiesPerPage = 8;
  const revoToUSD = 0.25;

  // Mock user's pool data
  const userPool = {
    id: 'user-pool-1',
    title: "CryptoTrader's Elite Pool",
    name: "CryptoTrader's Elite Pool",
    description: "Join my exclusive staking pool for premium trading insights, early access to market analysis, and community rewards. Stake REVO tokens to unlock different tiers of benefits and earn rewards based on your commitment level.",
    image: 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=600',
    totalStake: 125420,
    totalRewards: 8750,
    totalFans: 247,
    createdDate: '2024-12-15',
    stakedAmount: 0, // User's own stake in their pool (0 since it's their pool)
    stakeCurrency: 'REVO',
    rewardCurrency: 'REVO',
    endDate: '2025-06-15',
    status: 'active' as const,
    category: 'staking' as const,
    earnedRewards: 0,
    estimatedRewards: 0,
    participants: 247,
    totalReward: 8750
  };


  // Mock time series data for total rewards over time
  const generateRewardsData = () => {
    const data: { date: string; dailyRewards: number; totalRewards: number }[] = [];
    let cumulativeRewards = 0;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Generate daily rewards (50-300 per day)
      const dailyReward = Math.random() * 250 + 50;
      cumulativeRewards += dailyReward;
      
      // Ensure we end up close to our current total
      if (i === 0) {
        cumulativeRewards = userPool.totalRewards;
      }
      
      data.push({
        date: date.toISOString().split('T')[0],
        dailyRewards: dailyReward,
        totalRewards: cumulativeRewards
      });
    }
    
    return data;
  };

  // Mock time series data for total stake over time
  const generateStakeData = () => {
    const data: { date: string; stake: number }[] = [];
    const baseValue = 80000;
    let currentValue = baseValue;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Simulate growth with some volatility
      const growth = Math.random() * 1500 + 500; // 500-2000 growth per day
      currentValue += growth;
      
      // Ensure we end up at our current total
      if (i === 0) {
        currentValue = userPool.totalStake;
      }
      
      data.push({
        date: date.toISOString().split('T')[0],
        stake: Math.max(currentValue, baseValue)
      });
    }
    
    return data;
  };

  const rewardsData = generateRewardsData();
  const stakeData = generateStakeData();

  // Combine the data for the chart
  const chartData = rewardsData.map((reward, index) => ({
    date: reward.date,
    dailyRewards: reward.dailyRewards,
    totalRewards: reward.totalRewards,
    stake: stakeData[index].stake
  }));

  // Mock fan leaderboard data - expanded to 25 fans for pagination demo
  const fans: Fan[] = [
    {
      id: '1',
      username: 'whale_investor',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 50000,
      joinDate: '2024-12-16',
      tier: 4,
      totalRewards: 2500
    },
    {
      id: '2',
      username: 'crypto_enthusiast',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 25000,
      joinDate: '2024-12-18',
      tier: 4,
      totalRewards: 1250
    },
    {
      id: '3',
      username: 'diamond_hands',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 15000,
      joinDate: '2024-12-20',
      tier: 3,
      totalRewards: 900
    },
    {
      id: '4',
      username: 'hodl_master',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 12000,
      joinDate: '2024-12-22',
      tier: 3,
      totalRewards: 720
    },
    {
      id: '5',
      username: 'staking_pro',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 8000,
      joinDate: '2024-12-25',
      tier: 3,
      totalRewards: 480
    },
    {
      id: '6',
      username: 'defi_lover',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 5500,
      joinDate: '2025-01-02',
      tier: 3,
      totalRewards: 275
    },
    {
      id: '7',
      username: 'yield_farmer',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 3000,
      joinDate: '2025-01-05',
      tier: 2,
      totalRewards: 225
    },
    {
      id: '8',
      username: 'token_collector',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 2500,
      joinDate: '2025-01-08',
      tier: 2,
      totalRewards: 187
    },
    {
      id: '9',
      username: 'crypto_newbie',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 2000,
      joinDate: '2025-01-10',
      tier: 2,
      totalRewards: 150
    },
    {
      id: '10',
      username: 'blockchain_fan',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 1800,
      joinDate: '2025-01-12',
      tier: 2,
      totalRewards: 135
    },
    {
      id: '11',
      username: 'defi_explorer',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 1500,
      joinDate: '2025-01-14',
      tier: 2,
      totalRewards: 112
    },
    {
      id: '12',
      username: 'yield_hunter',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 1200,
      joinDate: '2025-01-16',
      tier: 1,
      totalRewards: 90
    },
    {
      id: '13',
      username: 'token_staker',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 1000,
      joinDate: '2025-01-18',
      tier: 1,
      totalRewards: 75
    },
    {
      id: '14',
      username: 'crypto_believer',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 900,
      joinDate: '2025-01-20',
      tier: 1,
      totalRewards: 67
    },
    {
      id: '15',
      username: 'pool_supporter',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 800,
      joinDate: '2025-01-22',
      tier: 1,
      totalRewards: 60
    },
    {
      id: '16',
      username: 'revo_holder',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 750,
      joinDate: '2025-01-24',
      tier: 1,
      totalRewards: 56
    },
    {
      id: '17',
      username: 'staking_rookie',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 650,
      joinDate: '2025-01-26',
      tier: 1,
      totalRewards: 48
    },
    {
      id: '18',
      username: 'crypto_enthusiast2',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 600,
      joinDate: '2025-01-28',
      tier: 1,
      totalRewards: 45
    },
    {
      id: '19',
      username: 'token_lover',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 550,
      joinDate: '2025-01-30',
      tier: 1,
      totalRewards: 41
    },
    {
      id: '20',
      username: 'defi_starter',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 500,
      joinDate: '2025-02-01',
      tier: 1,
      totalRewards: 37
    },
    {
      id: '21',
      username: 'blockchain_learner',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 450,
      joinDate: '2025-02-03',
      tier: 1,
      totalRewards: 33
    },
    {
      id: '22',
      username: 'crypto_student',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 400,
      joinDate: '2025-02-05',
      tier: 1,
      totalRewards: 30
    },
    {
      id: '23',
      username: 'pool_participant',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 350,
      joinDate: '2025-02-07',
      tier: 1,
      totalRewards: 26
    },
    {
      id: '24',
      username: 'staking_beginner',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 300,
      joinDate: '2025-02-09',
      tier: 1,
      totalRewards: 22
    },
    {
      id: '25',
      username: 'revo_fan',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      stakedAmount: 250,
      joinDate: '2025-02-11',
      tier: 1,
      totalRewards: 18
    }
  ];

  // Mock pool activity data
  const poolActivities: PoolActivity[] = [
    {
      id: '1',
      type: 'stake',
      user: 'whale_investor',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 50000,
      currency: 'REVO',
      timestamp: '2025-01-15T14:30:00Z',
      txHash: '0xabc123...'
    },
    {
      id: '2',
      type: 'claim',
      user: 'crypto_enthusiast',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 125,
      currency: 'REVO',
      timestamp: '2025-01-15T12:15:00Z',
      txHash: '0xdef456...'
    },
    {
      id: '3',
      type: 'stake',
      user: 'diamond_hands',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 15000,
      currency: 'REVO',
      timestamp: '2025-01-15T10:45:00Z',
      txHash: '0xghi789...'
    },
    {
      id: '4',
      type: 'unstake',
      user: 'hodl_master',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 2000,
      currency: 'REVO',
      timestamp: '2025-01-15T09:20:00Z',
      txHash: '0xjkl012...'
    },
    {
      id: '5',
      type: 'claim',
      user: 'staking_pro',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 75,
      currency: 'REVO',
      timestamp: '2025-01-14T16:30:00Z',
      txHash: '0xmno345...'
    },
    {
      id: '6',
      type: 'stake',
      user: 'defi_lover',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 5500,
      currency: 'REVO',
      timestamp: '2025-01-14T14:15:00Z',
      txHash: '0xpqr678...'
    },
    {
      id: '7',
      type: 'stake',
      user: 'yield_farmer',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 3000,
      currency: 'REVO',
      timestamp: '2025-01-14T11:45:00Z',
      txHash: '0xstu901...'
    },
    {
      id: '8',
      type: 'claim',
      user: 'token_collector',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 50,
      currency: 'REVO',
      timestamp: '2025-01-14T09:30:00Z',
      txHash: '0xvwx234...'
    },
    {
      id: '9',
      type: 'unstake',
      user: 'crypto_newbie',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 500,
      currency: 'REVO',
      timestamp: '2025-01-13T15:20:00Z',
      txHash: '0xyzab567...'
    },
    {
      id: '10',
      type: 'stake',
      user: 'blockchain_fan',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 1800,
      currency: 'REVO',
      timestamp: '2025-01-13T13:10:00Z',
      txHash: '0xcdef890...'
    },
    {
      id: '11',
      type: 'claim',
      user: 'defi_explorer',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 40,
      currency: 'REVO',
      timestamp: '2025-01-13T10:45:00Z',
      txHash: '0xghij123...'
    },
    {
      id: '12',
      type: 'stake',
      user: 'yield_hunter',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 1200,
      currency: 'REVO',
      timestamp: '2025-01-12T16:20:00Z',
      txHash: '0xklmn456...'
    },
    {
      id: '13',
      type: 'unstake',
      user: 'token_staker',
      avatar: 'https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 300,
      currency: 'REVO',
      timestamp: '2025-01-12T14:30:00Z',
      txHash: '0xopqr789...'
    },
    {
      id: '14',
      type: 'claim',
      user: 'crypto_believer',
      avatar: 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 35,
      currency: 'REVO',
      timestamp: '2025-01-12T11:15:00Z',
      txHash: '0xstuv012...'
    },
    {
      id: '15',
      type: 'stake',
      user: 'pool_supporter',
      avatar: 'https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 800,
      currency: 'REVO',
      timestamp: '2025-01-11T17:45:00Z',
      txHash: '0xwxyz345...'
    },
    {
      id: '16',
      type: 'claim',
      user: 'revo_holder',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 28,
      currency: 'REVO',
      timestamp: '2025-01-11T15:30:00Z',
      txHash: '0xabcd678...'
    },
    {
      id: '17',
      type: 'stake',
      user: 'staking_rookie',
      avatar: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100',
      amount: 650,
      currency: 'REVO',
      timestamp: '2025-01-11T12:20:00Z',
      txHash: '0xefgh901...'
    }
  ];
  // Calculate pagination
  const totalPages = Math.ceil(fans.length / fansPerPage);
  const startIndex = (currentPage - 1) * fansPerPage;
  const endIndex = startIndex + fansPerPage;
  const currentFans = fans.slice(startIndex, endIndex);

  // Calculate history pagination
  const totalHistoryPages = Math.ceil(poolActivities.length / activitiesPerPage);
  const historyStartIndex = (currentHistoryPage - 1) * activitiesPerPage;
  const historyEndIndex = historyStartIndex + activitiesPerPage;
  const currentActivities = poolActivities.slice(historyStartIndex, historyEndIndex);

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const handlePageClick = (page: number) => {
    setCurrentPage(page);
  };

  const handlePreviousHistoryPage = () => {
    setCurrentHistoryPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextHistoryPage = () => {
    setCurrentHistoryPage(prev => Math.min(prev + 1, totalHistoryPages));
  };

  const handleHistoryPageClick = (page: number) => {
    setCurrentHistoryPage(page);
  };

  const formatValue = (value: number, currency: string = 'REVO') => {
    if (showUSD && currency === 'REVO') {
      return `$${(value * revoToUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${value.toLocaleString()} ${currency}`;
  };

  const getTierInfo = (tierLevel: number) => {
    const tiers = [
      { level: 1, name: 'Bronze Tier', color: 'bg-orange-100 text-orange-700', icon: '🥉' },
      { level: 2, name: 'Silver Tier', color: 'bg-gray-100 text-gray-700', icon: '🥈' },
      { level: 3, name: 'Gold Tier', color: 'bg-yellow-100 text-yellow-700', icon: '🥇' },
      { level: 4, name: 'Diamond Tier', color: 'bg-blue-100 text-blue-700', icon: '💎' }
    ];
    return tiers.find(t => t.level === tierLevel) || tiers[0];
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Crown className="w-5 h-5 text-yellow-500" />;
      case 1: return <Medal className="w-5 h-5 text-gray-400" />;
      case 2: return <Award className="w-5 h-5 text-orange-500" />;
      default: return <Star className="w-4 h-4 text-gray-400" />;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'stake': return <ArrowUp className="w-4 h-4 text-green-600" />;
      case 'unstake': return <ArrowDown className="w-4 h-4 text-red-600" />;
      case 'claim': return <Gift className="w-4 h-4 text-blue-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'stake': return 'bg-green-50 border-green-200';
      case 'unstake': return 'bg-red-50 border-red-200';
      case 'claim': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getActivityText = (type: string) => {
    switch (type) {
      case 'stake': return 'Staked';
      case 'unstake': return 'Unstaked';
      case 'claim': return 'Claimed';
      default: return 'Activity';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - activityTime.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return activityTime.toLocaleDateString();
  };

  // Create line chart path
  const createDualAxisChartElements = () => {
    const chartWidth = 900;
    const chartHeight = 400;
    const padding = { top: 40, right: 110, bottom: 80, left: 120 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    
    // Get max and min values with 10% padding for better visualization
    const maxDailyRewards = Math.max(...chartData.map(d => d.dailyRewards));
    const minDailyRewards = 0;
    const dailyRewardsMax = maxDailyRewards * 1.15; // Add 15% padding
    
    const maxStake = Math.max(...chartData.map(d => d.stake));
    const minStake = Math.min(...chartData.map(d => d.stake));
    const stakeRange = maxStake - minStake;
    const stakeMin = minStake - (stakeRange * 0.08); // 8% padding below
    const stakeMax = maxStake + (stakeRange * 0.12); // 12% padding above
    
    const dailyRewardsRange = dailyRewardsMax - minDailyRewards;
    const adjustedStakeRange = stakeMax - stakeMin;
    
    // Create bars for daily rewards
    const barWidth = Math.max(plotWidth / chartData.length * 0.4, 5); // 40% width, min 5px
    const dailyRewardsBars = chartData.map((point, index) => {
      const x = padding.left + 20 + (index / (chartData.length - 1)) * (plotWidth - 40);
      const barHeight = ((point.dailyRewards - minDailyRewards) / dailyRewardsRange) * plotHeight;
      const y = padding.top + plotHeight - barHeight;
      return { 
        x: x - barWidth / 2, 
        y, 
        width: barWidth, 
        height: barHeight, 
        value: point.dailyRewards, 
        date: point.date 
      };
    });
    
    // Create points for the stake line
    const stakePoints = chartData.map((point, index) => {
      const x = padding.left + 20 + (index / (chartData.length - 1)) * (plotWidth - 40);
      const y = padding.top + plotHeight - ((point.stake - stakeMin) / adjustedStakeRange) * plotHeight;
      return { x, y, value: point.stake, date: point.date };
    });
    
    // Create SVG path for stake line
    const stakePathData = stakePoints.map((point, index) => 
      `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`
    ).join(' ');
    
    // Create left Y-axis labels (Total Stake) - 5 evenly spaced labels
    const leftYLabels: { value: number; y: number }[] = [];
    const labelCount = 5;
    for (let i = 0; i < labelCount; i++) {
      const value = stakeMin + (adjustedStakeRange * i / (labelCount - 1));
      const y = padding.top + plotHeight - (i / (labelCount - 1)) * plotHeight;
      leftYLabels.push({ value, y });
    }
    
    // Create right Y-axis labels (Daily Rewards) - 5 evenly spaced labels
    const rightYLabels: { value: number; y: number }[] = [];
    for (let i = 0; i < labelCount; i++) {
      const value = minDailyRewards + (dailyRewardsRange * i / (labelCount - 1));
      const y = padding.top + plotHeight - (i / (labelCount - 1)) * plotHeight;
      rightYLabels.push({ value, y });
    }
    
    // Create X-axis labels (show every 7th day for cleaner look)
    const xLabels: { x: number; label: string; date: string }[] = chartData.filter((_, index) => index % 5 === 0 || index === chartData.length - 1)
      .map((point, _) => {
        const originalIndex = chartData.indexOf(point);
        const x = padding.left + 20 + (originalIndex / (chartData.length - 1)) * (plotWidth - 40);
        return { 
          x, 
          label: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          date: point.date
        };
      });
    
    return { 
      dailyRewardsBars,
      stakePoints, 
      stakePathData, 
      leftYLabels,
      rightYLabels,
      xLabels, 
      chartWidth, 
      chartHeight, 
      padding 
    };
  };
  
  const chartElements = createDualAxisChartElements();

  const handleViewPool = () => {
    setIsPoolModalOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Pool Dashboard</h1>
          <p className="text-gray-600">Manage and monitor your reward pool performance</p>
        </div>
        
        {/* USD Toggle */}
        <div className="flex items-center space-x-3 bg-white border border-gray-200 rounded-lg p-2">
          <span className={`text-sm font-medium transition-colors duration-200 ${!showUSD ? 'text-purple-600' : 'text-gray-500'}`}>
            REVO
          </span>
          <button
            onClick={() => setShowUSD(!showUSD)}
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-300"
            title={`Switch to ${showUSD ? 'REVO' : 'USD'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
                showUSD ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-sm font-medium transition-colors duration-200 ${showUSD ? 'text-green-600' : 'text-gray-500'}`}>
            USD
          </span>
        </div>
      </div>

      {/* Pool Overview */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pool Image */}
          <div className="relative h-64">
            <div className="h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm">
              <img
                src={userPool.image}
                alt={`${userPool.name} pool`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Pool Info */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{userPool.title}</h2>
              <p className="text-gray-600 leading-relaxed">{userPool.description}</p>
            </div>

            {/* View Pool Button */}
            <div>
              <button
                onClick={handleViewPool}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 shadow-sm"
              >
                <Eye className="w-5 h-5" />
                <span>View Pool Details</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Stake */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Coins className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Total Stake</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">
              {formatValue(userPool.totalStake)}
            </p>
            <p className="text-sm text-green-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              +12.5% this month
            </p>
          </div>
        </div>

        {/* Total Rewards */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Trophy className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Total Rewards</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">
              {formatValue(userPool.totalRewards)}
            </p>
            <p className="text-sm text-blue-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              +8.3% this month
            </p>
          </div>
        </div>

        {/* Total Fans */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-sm text-gray-500">Total Fans</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">
              {userPool.totalFans.toLocaleString()}
            </p>
            <p className="text-sm text-purple-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              +15 new this week
            </p>
          </div>
        </div>

        {/* Pool Status */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Status</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-green-600 capitalize">
              {userPool.status}
            </p>
            <p className="text-sm text-gray-600 flex items-center">
              <Clock className="w-4 h-4 mr-1" />
              Ends {new Date(userPool.endDate).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Pool Performance</h3>
            <p className="text-sm text-gray-600">Track your pool's growth over time</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">Total Stake (Left Axis)</span>
            </div>
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-gray-600">Daily Rewards (Right Axis)</span>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="relative overflow-x-auto">
          <div className="min-w-[800px]">
          <svg
            width={chartElements.chartWidth}
            height={chartElements.chartHeight}
            className="w-full h-auto bg-white rounded-lg border border-gray-200"
            viewBox={`0 0 ${chartElements.chartWidth} ${chartElements.chartHeight}`}
          >
            {/* Background and grid */}
            <defs>
              <pattern id="grid" width="50" height="40" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 40" fill="none" stroke="#f8fafc" strokeWidth="1"/>
              </pattern>
            </defs>
            
            {/* Chart background */}
            <rect 
              x={chartElements.padding.left + 10} 
              y={chartElements.padding.top} 
              width={chartElements.chartWidth - chartElements.padding.left - chartElements.padding.right - 20} 
              height={chartElements.chartHeight - chartElements.padding.top - chartElements.padding.bottom} 
              fill="#fafafa"
              stroke="#e2e8f0"
              strokeWidth="1"
            />

            {/* Horizontal grid lines */}
            {chartElements.leftYLabels?.map((label, index) => (
              <line
                key={`grid-h-${index}`}
                x1={chartElements.padding.left + 10}
                y1={label.y}
                x2={chartElements.chartWidth - chartElements.padding.right - 10}
                y2={label.y}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            ))}

            {/* Left Y-axis labels (Total Stake) */}
            {chartElements.leftYLabels?.map((label, index) => (
              <g key={`left-label-${index}`}>
                <text 
                  x={chartElements.padding.left - 25} 
                  y={label.y + 4} 
                  textAnchor="end" 
                  className="text-xs fill-green-700 font-medium"
                >
                  {label.value >= 1000 ? `${(label.value / 1000).toFixed(1)}k` : Math.round(label.value).toLocaleString()}
                </text>
              </g>
            ))}

            {/* Right Y-axis labels (Daily Rewards) */}
            {chartElements.rightYLabels?.map((label, index) => (
              <g key={`right-label-${index}`}>
                <text 
                  x={chartElements.chartWidth - chartElements.padding.right + 25} 
                  y={label.y + 4} 
                  textAnchor="start" 
                  className="text-xs fill-blue-700 font-medium"
                >
                  {Math.round(label.value).toLocaleString()}
                </text>
              </g>
            ))}

            {/* X-axis labels */}
            {chartElements.xLabels?.map((label, index) => (
              <g key={`x-label-${index}`}>
                <text 
                  x={label.x} 
                  y={chartElements.chartHeight - chartElements.padding.bottom + 30} 
                  textAnchor="middle" 
                  className="text-xs fill-gray-700 font-medium"
                >
                  {label.label}
                </text>
              </g>
            ))}

            {/* Daily Rewards bars */}
            {chartElements.dailyRewardsBars?.map((bar, index) => (
              <rect
                key={`daily-reward-bar-${index}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill="#3b82f6"
                fillOpacity="0.8"
                className="hover:fill-opacity-100 cursor-pointer transition-all duration-200"
                rx="2"
              >
                <title>{`${new Date(bar.date).toLocaleDateString()}: ${Math.round(bar.value).toLocaleString()} REVO Daily Rewards`}</title>
              </rect>
            ))}
            
            {/* Total Stake line */}
            <path 
              d={chartElements.stakePathData} 
              fill="none" 
              stroke="#10b981" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />

            {/* Total Stake data points */}
            {chartElements.stakePoints?.map((point, index) => (
              <circle
                key={`stake-point-${index}`}
                cx={point.x}
                cy={point.y}
                r="3.5"
                fill="#10b981"
                stroke="white"
                strokeWidth="1.5"
                className="hover:fill-green-600 cursor-pointer transition-all duration-200"
              >
                <title>{`${new Date(point.date).toLocaleDateString()}: ${Math.round(point.value).toLocaleString()} REVO Total Stake`}</title>
              </circle>
            ))}

            {/* Axis lines */}
            <line 
              x1={chartElements.padding.left} 
              y1={chartElements.chartHeight - chartElements.padding.bottom} 
              x2={chartElements.chartWidth - chartElements.padding.right} 
              y2={chartElements.chartHeight - chartElements.padding.bottom} 
              stroke="#374151" 
              strokeWidth="1.5"
            />
            <line 
              x1={chartElements.padding.left} 
              y1={chartElements.padding.top} 
              x2={chartElements.padding.left} 
              y2={chartElements.chartHeight - chartElements.padding.bottom} 
              stroke="#10b981" 
              strokeWidth="1.5"
            />
            <line 
              x1={chartElements.chartWidth - chartElements.padding.right} 
              y1={chartElements.padding.top} 
              x2={chartElements.chartWidth - chartElements.padding.right} 
              y2={chartElements.chartHeight - chartElements.padding.bottom} 
              stroke="#3b82f6" 
              strokeWidth="1.5"
            />

          </svg>
        </div>
        </div>
      </div>

      {/* Fan Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Top Fans</h3>
            <p className="text-sm text-gray-600">Your most dedicated supporters</p>
          </div>
        </div>

        <div className="space-y-4">
          {currentFans.map((fan, index) => {
            const globalIndex = startIndex + index;
            const tierInfo = getTierInfo(fan.tier);
            
            return (
              <div key={fan.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-500 w-6">
                      #{globalIndex + 1}
                    </span>
                    {getRankIcon(globalIndex)}
                  </div>
                  
                  <img
                    src={fan.avatar}
                    alt={fan.username}
                    className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                  />
                  
                  <div>
                    <p className="font-medium text-gray-900">{fan.username}</p>
                    <p className="text-sm text-gray-500">
                      Joined {new Date(fan.joinDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatValue(fan.stakedAmount)}
                    </p>
                    <p className="text-sm text-gray-500">Staked</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-semibold text-green-600">
                      {formatValue(fan.totalRewards)}
                    </p>
                    <p className="text-sm text-gray-500">Rewards</p>
                  </div>
                  
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${tierInfo.color}`}>
                    {tierInfo.icon} {tierInfo.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1}-{Math.min(endIndex, fans.length)} of {fans.length} fans
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageClick(pageNum)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pool Activity History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <p className="text-sm text-gray-600">Latest pool transactions and events</p>
          </div>
        </div>

        <div className="space-y-3">
          {currentActivities.map((activity) => (
            <div 
              key={activity.id}
              className={`flex items-center justify-between p-4 rounded-lg border ${getActivityColor(activity.type)} transition-colors duration-200`}
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {getActivityIcon(activity.type)}
                  <span className="text-sm font-medium text-gray-900">
                    {getActivityText(activity.type)}
                  </span>
                </div>
                
                <img
                  src={activity.avatar}
                  alt={activity.user}
                  className="w-8 h-8 rounded-full object-cover border border-white shadow-sm"
                />
                
                <div>
                  <p className="font-medium text-gray-900">{activity.user}</p>
                  <p className="text-sm text-gray-500">
                    {formatTimeAgo(activity.timestamp)}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  {formatValue(activity.amount, activity.currency)}
                </p>
                {activity.txHash && (
                  <p className="text-xs text-gray-500 font-mono">
                    {activity.txHash}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Activity Pagination */}
        {totalHistoryPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Showing {historyStartIndex + 1}-{Math.min(historyEndIndex, poolActivities.length)} of {poolActivities.length} activities
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousHistoryPage}
                disabled={currentHistoryPage === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalHistoryPages) }, (_, i) => {
                  let pageNum;
                  if (totalHistoryPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentHistoryPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentHistoryPage >= totalHistoryPages - 2) {
                    pageNum = totalHistoryPages - 4 + i;
                  } else {
                    pageNum = currentHistoryPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handleHistoryPageClick(pageNum)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        currentHistoryPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={handleNextHistoryPage}
                disabled={currentHistoryPage === totalHistoryPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pool Details Modal */}
      {isPoolModalOpen && (
        <PoolDetailsModal
          pool={userPool}
          isOpen={isPoolModalOpen}
          onClose={() => setIsPoolModalOpen(false)}
        />
      )}
    </div>
  );
}
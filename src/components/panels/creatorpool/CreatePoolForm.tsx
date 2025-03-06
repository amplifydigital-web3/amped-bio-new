import React, { useState } from 'react';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import { CoinsIcon, Clock, Users, Percent } from 'lucide-react';

interface CreatePoolFormProps {
  onComplete: () => void;
}

export function CreatePoolForm({ onComplete }: CreatePoolFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tokenAddress: '',
    rewardRate: '',
    lockPeriod: '',
    minStake: '',
    maxParticipants: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would integrate with a smart contract to create the pool
    console.log('Creating pool:', formData);
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">About Creator Pools</h3>
        <p className="text-sm text-blue-700">
          Creator Pools allow you to create a staking mechanism where supporters can stake tokens
          and earn rewards. This helps build a sustainable economy around your content.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          label="Pool Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Creator Season 1 Pool"
          required
        />

        <Input
          label="Token Contract Address"
          value={formData.tokenAddress}
          onChange={(e) => setFormData({ ...formData, tokenAddress: e.target.value })}
          placeholder="0x..."
          required
        />

        <Input
          label="Reward Rate (% APR)"
          value={formData.rewardRate}
          onChange={(e) => setFormData({ ...formData, rewardRate: e.target.value })}
          type="number"
          min="0"
          max="100"
          placeholder="5"
          required
        />

        <Input
          label="Lock Period (Days)"
          value={formData.lockPeriod}
          onChange={(e) => setFormData({ ...formData, lockPeriod: e.target.value })}
          type="number"
          min="1"
          placeholder="30"
          required
        />

        <Input
          label="Minimum Stake"
          value={formData.minStake}
          onChange={(e) => setFormData({ ...formData, minStake: e.target.value })}
          type="number"
          min="0"
          placeholder="100"
          required
        />

        <Input
          label="Maximum Participants"
          value={formData.maxParticipants}
          onChange={(e) => setFormData({ ...formData, maxParticipants: e.target.value })}
          type="number"
          min="1"
          placeholder="1000"
          required
        />
      </div>

      <Textarea
        label="Pool Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        placeholder="Describe the benefits and purpose of your staking pool..."
        rows={4}
        required
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2 text-gray-600 mb-2">
            <CoinsIcon className="w-5 h-5" />
            <span className="font-medium">Rewards</span>
          </div>
          <p className="text-sm text-gray-500">Earn {formData.rewardRate || '0'}% APR</p>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2 text-gray-600 mb-2">
            <Clock className="w-5 h-5" />
            <span className="font-medium">Duration</span>
          </div>
          <p className="text-sm text-gray-500">{formData.lockPeriod || '0'} Days Lock</p>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2 text-gray-600 mb-2">
            <Percent className="w-5 h-5" />
            <span className="font-medium">Minimum</span>
          </div>
          <p className="text-sm text-gray-500">{formData.minStake || '0'} Tokens</p>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2 text-gray-600 mb-2">
            <Users className="w-5 h-5" />
            <span className="font-medium">Capacity</span>
          </div>
          <p className="text-sm text-gray-500">{formData.maxParticipants || '0'} Users</p>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onComplete}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Pool
        </button>
      </div>
    </form>
  );
}
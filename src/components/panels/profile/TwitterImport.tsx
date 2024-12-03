import React, { useState } from 'react';
import { Twitter } from 'lucide-react';
import { Input } from '../../ui/Input';
import { scrapeTwitterProfile } from '../../../utils/twitter';
import type { UserProfile } from '../../../types/editor';

interface TwitterImportProps {
  onProfileUpdate: (profile: Partial<UserProfile>) => void;
}

export function TwitterImport({ onProfileUpdate }: TwitterImportProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    if (!username) return;

    setLoading(true);
    setError('');

    try {
      const profile = await scrapeTwitterProfile(username);
      onProfileUpdate({
        name: profile.name,
        bio: profile.bio,
        photoUrl: profile.profileImage
      });
      setUsername('');
    } catch (err) {
      setError('Failed to import Twitter profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Twitter className="w-5 h-5 text-[#1DA1F2]" />
        <h3 className="text-sm font-medium text-gray-900">Import from Twitter</h3>
      </div>
      
      <div className="flex space-x-2">
        <Input
          label=""
          placeholder="Enter Twitter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="flex-1"
        />
        <button
          onClick={handleImport}
          disabled={loading || !username}
          className="px-4 py-2 bg-[#1DA1F2] text-white rounded-md hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed h-[42px] mt-[1px]"
        >
          {loading ? 'Importing...' : 'Import'}
        </button>
      </div>
      
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
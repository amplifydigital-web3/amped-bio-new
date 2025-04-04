import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '../../ui/Input';
import { PlatformSelect } from './PlatformSelect';
import type { LinkBlock } from '../../../types/editor';
import { PlatformId, getPlatformUrl } from '@/utils/platforms';

interface LinkFormProps {
  onAdd: (block: LinkBlock) => void;
}

export function LinkForm({ onAdd }: LinkFormProps) {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState<PlatformId | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  // Update URL when username or platform changes (for non-custom platforms)
  useEffect(() => {
    if (platform && platform !== 'custom' && username) {
      setUrl(getPlatformUrl(platform, username));
    }
  }, [platform, username]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !platform || !label) return;
    if (error) return;

    onAdd({
      id: 0,
      type: 'link',
      platform,
      url,
      label,
    });

    setUrl('');
    setUsername('');
    setPlatform(null);
    setLabel('');
    setError('');
  };

  const handlePlatformChange = (value: PlatformId) => {
    setPlatform(value);
    // Reset fields when changing platforms
    setUsername('');
    setError('');
    if (value === 'custom') {
      setUrl('');
    }
  };

  const isValidUsername = (value: string): boolean => {
    // Allow alphanumeric characters, hyphens, underscores, periods
    const validUsernamePattern = /^[a-zA-Z0-9._-]*$/;
    return validUsernamePattern.test(value);
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (platform === 'email') {
      // Email validation is handled by the input type="email"
      setUsername(value);
      setError('');
    } else if (platform === 'document') {
      // Full URL - allow the input
      setUsername(value);
      setError('');
    } else if (!value || isValidUsername(value)) {
      setUsername(value);
      setError('');
    } else {
      setError('Username can only contain letters, numbers, dots, hyphens, and underscores');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PlatformSelect
        value={platform}
        onChange={handlePlatformChange}
      />

      {platform === 'custom' ? (
        <Input
          label="URL"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          required
        />
      ) : platform === 'email' ? (
        <Input
          label="Email Address"
          type="email"
          value={username}
          onChange={handleUsernameChange}
          placeholder="your@email.com"
          required
        />
      ) : platform ? (
        <div>
          <label className="block text-sm font-medium mb-1">
            {platform === 'document' ? 'Document URL' : 'Username'}
          </label>
          <div className={`flex items-center border rounded-md overflow-hidden ${error ? 'border-red-500' : ''}`}>
            {platform !== 'document' && (
              <span className="bg-gray-100 px-3 py-2 text-gray-500 text-sm border-r">
                {getPlatformUrl(platform, '').replace('{{username}}', '')}
              </span>
            )}
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              className={`flex-grow px-3 py-2 focus:outline-none ${error ? 'bg-red-50' : ''}`}
              placeholder={platform === 'document' ? 'https://example.com/doc' : 'username'}
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      ) : null}

      <Input
        label="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Display text for your link"
        required
      />

      <button
        type="submit"
        disabled={!!error}
        className={`w-full flex items-center justify-center px-4 py-2 text-white rounded-md ${error ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Link
      </button>
    </form>
  );
}
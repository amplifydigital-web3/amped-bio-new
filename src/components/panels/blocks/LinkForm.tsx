import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '../../ui/Input';
import { PlatformSelect } from './PlatformSelect';
import type { LinkBlock } from '../../../types/editor';
import { getPlatformUrl } from '../../../utils/platforms';

interface LinkFormProps {
  onAdd: (block: LinkBlock) => void;
}

export function LinkForm({ onAdd }: LinkFormProps) {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState('');
  const [label, setLabel] = useState('');

  // Update URL when username or platform changes (for non-custom platforms)
  useEffect(() => {
    if (platform && platform !== 'custom' && username) {
      setUrl(getPlatformUrl(platform, username));
    }
  }, [platform, username]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !platform || !label) return;

    onAdd({
      id: 0,
      type: 'link',
      platform,
      url,
      label,
    });

    setUrl('');
    setUsername('');
    setPlatform('');
    setLabel('');
  };

  const handlePlatformChange = (value: string) => {
    setPlatform(value);
    // Reset fields when changing platforms
    setUsername('');
    if (value === 'custom') {
      setUrl('');
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
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your@email.com"
          required
        />
      ) : platform ? (
        <div>
          <label className="block text-sm font-medium mb-1">
            {platform === 'document' ? 'Document URL' : 'Username'}
          </label>
          <div className="flex items-center border rounded-md overflow-hidden">
            {platform !== 'document' && (
              <span className="bg-gray-100 px-3 py-2 text-gray-500 text-sm border-r">
                {getPlatformUrl(platform, '').replace('{{username}}', '')}
              </span>
            )}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-grow px-3 py-2 focus:outline-none"
              placeholder={platform === 'document' ? 'https://example.com/doc' : 'username'}
              required
            />
          </div>
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
        className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Link
      </button>
    </form>
  );
}
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '../../ui/Input';
import { PlatformSelect } from './PlatformSelect';
import type { LinkBlock } from '../../../types/editor';

interface LinkFormProps {
  onAdd: (block: LinkBlock) => void;
}

export function LinkForm({ onAdd }: LinkFormProps) {
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState('');
  const [label, setLabel] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !platform || !label) return;

    onAdd({
      id: crypto.randomUUID(),
      type: 'link',
      platform,
      url,
      label,
    });

    setUrl('');
    setPlatform('');
    setLabel('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PlatformSelect
        value={platform}
        onChange={(value) => setPlatform(value)}
      />
      
      <Input
        label="URL"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://"
        required
      />
      
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
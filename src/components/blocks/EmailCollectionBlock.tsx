import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import type { ThemeConfig } from '../../types/editor';
import type { TextBlock } from '@/api/api.types';

interface EmailCollectionBlockProps {
  block: TextBlock;
  theme: ThemeConfig;
}

export function EmailCollectionBlock({ block, theme }: EmailCollectionBlockProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO MAKE THIS SEND REAL EMAILS
    setStatus('success');
    setEmail('');
  };

  return (
    <div className="w-full p-6 rounded-lg bg-white/50 backdrop-blur-sm space-y-4">
      <div className="flex items-center space-x-2">
        <Mail className="w-5 h-5 text-blue-500" />
        <h3
          className="font-medium"
          style={{
            fontFamily: theme.fontFamily,
            color: theme.fontColor,
          }}
        >
          {block.config.content || 'Subscribe to Updates'}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ fontFamily: theme.fontFamily }}
          required
        />
        <button
          type="submit"
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          style={{ fontFamily: theme.fontFamily }}
        >
          Subscribe
        </button>
      </form>

      {status === 'success' && (
        <p className="text-sm text-green-600" style={{ fontFamily: theme.fontFamily }}>
          Thanks for subscribing!
        </p>
      )}
    </div>
  );
}

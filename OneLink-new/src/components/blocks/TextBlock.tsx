import React from 'react';
import type { TextBlock as TextBlockType, Theme } from '../../types/editor';
import { EmailCollectionBlock } from './EmailCollectionBlock';
import { TelegramBlock } from './TelegramBlock';
import { TeamBlock } from './TeamBlock';

interface TextBlockProps {
  block: TextBlockType;
  theme: Theme;
}

export function TextBlock({ block, theme }: TextBlockProps) {
  // Check if this is a special text block type
  if (block.id.startsWith('email-collect')) {
    return <EmailCollectionBlock block={block} theme={theme} />;
  }
  if (block.id.startsWith('telegram')) {
    return <TelegramBlock block={block} theme={theme} />;
  }
  if (block.id.startsWith('team')) {
    return <TeamBlock block={block} theme={theme} />;
  }

  // Regular text block
  return (
    <div
      className="w-full p-4 rounded-lg bg-white/50 backdrop-blur-sm"
      style={{ fontFamily: theme.fontFamily }}
    >
      <p
        className="whitespace-pre-wrap"
        style={{ 
          color: theme.fontColor,
          fontSize: theme.fontSize
        }}
      >
        {block.content}
      </p>
    </div>
  );
}
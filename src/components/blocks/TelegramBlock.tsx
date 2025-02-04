import { MessageCircle } from 'lucide-react';
import type { TextBlock as TextBlockType, ThemeConfig } from '../../types/editor';

interface TelegramBlockProps {
  block: TextBlockType;
  theme: ThemeConfig;
}

export function TelegramBlock({ block, theme }: TelegramBlockProps) {
  return (
    <div className="w-full p-6 rounded-lg bg-white/50 backdrop-blur-sm space-y-4">
      <div className="flex items-center space-x-2">
        <MessageCircle className="w-5 h-5 text-[#26A5E4]" />
        <h3
          className="font-medium"
          style={{
            fontFamily: theme.fontFamily,
            color: theme.fontColor
          }}
        >
          Join our Telegram Channel
        </h3>
      </div>

      <a
        href={block.content}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full px-4 py-3 bg-[#26A5E4] text-white rounded-lg hover:bg-[#229ED9] transition-colors text-center"
        style={{ fontFamily: theme.fontFamily }}
      >
        Join Channel
      </a>

      <p
        className="text-sm text-gray-600"
        style={{
          fontFamily: theme.fontFamily,
          color: theme.fontColor
        }}
      >
        Stay updated with our latest announcements and community discussions.
      </p>
    </div>
  );
}
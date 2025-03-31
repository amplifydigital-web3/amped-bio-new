import {
  Music,
  Instagram,
  Youtube,
  DollarSign,
  Store,
  Mail,
  MessageCircle,
  FileText,
  Newspaper,
  Users,
  ArrowUpRight,
} from 'lucide-react';
import type { Block, LinkBlock, MediaBlock, TextBlock } from '../../../types/editor';
import { FaXTwitter } from 'react-icons/fa6';

interface BlockPickerProps {
  onAdd: (block: Block) => void;
}

const blockTypes = [
  {
    category: 'Media Embeds',
    blocks: [
      { id: 'spotify', name: 'Spotify', icon: Music, type: 'media' },
      { id: 'instagram', name: 'Instagram', icon: Instagram, type: 'media' },
      { id: 'youtube', name: 'YouTube', icon: Youtube, type: 'media' },
      { id: 'twitter', name: 'X Post', icon: FaXTwitter, type: 'media' },
    ],
  },
  {
    category: 'Web3',
    blocks: [
      { id: 'token-price', name: 'Token Price', icon: DollarSign, type: 'media' },
      { id: 'nft-collection', name: 'NFT Collection', icon: Store, type: 'media' },
      { id: 'uniswap', name: 'Uniswap Swap', icon: ArrowUpRight, type: 'media' },
      { id: 'creator-pool', name: 'Creator Pool', icon: Users, type: 'media' },
    ],
  },
  {
    category: 'Utility',
    blocks: [
      { id: 'email-collect', name: 'Email Collection', icon: Mail, type: 'text' },
      { id: 'telegram', name: 'Telegram Channel', icon: MessageCircle, type: 'text' },
      { id: 'text', name: 'Text Block', icon: FileText, type: 'text' },
      { id: 'substack', name: 'Substack Feed', icon: Newspaper, type: 'media' },
      { id: 'team', name: 'Team Members', icon: Users, type: 'text' },
    ],
  },
];

export function BlockPicker({ onAdd }: BlockPickerProps) {
  const handleAddBlock = (blockType: string, blockId: string) => {
    if (blockType === 'media') {
      const newBlock: MediaBlock = {
        id: blockId,
        type: 'media',
        platform: blockId,
        url: '',
        label: ''
      }
      onAdd(newBlock);
    }
    else if (blockType === 'link') {
      const newBlock: LinkBlock = {
        id: blockId,
        type: 'link',
        platform: '',
        url: '',
        label: ''
      }
      onAdd(newBlock);
    }
    else {
      const newBlock: TextBlock = {
        id: blockId,
        type: 'text',
        content: '',
        platform: 'text'
      }
      onAdd(newBlock);
    }
  };

  return (
    <div className="space-y-6">
      {blockTypes.map((category) => (
        <div key={category.category} className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">{category.category}</h3>
          <div className="grid grid-cols-2 gap-3">
            {category.blocks.map((block) => (
              <button
                key={block.id}
                onClick={() => handleAddBlock(block.type, block.id)}
                className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all"
              >
                <block.icon className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{block.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
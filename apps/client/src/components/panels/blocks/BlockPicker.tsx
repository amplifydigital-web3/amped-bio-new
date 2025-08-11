import { BlockType, LinkBlock, MediaBlock, MediaBlockPlatform, TextBlock } from "@ampedbio/constants";
import { getPlatformIcon } from "@/utils/platforms";
import { FileText, LucideIcon } from "lucide-react";
import { IconType } from "react-icons/lib";
import { useState } from "react";
import { BlockEditor } from "./BlockEditor";

interface BlockPickerProps {
  onAdd: (block: BlockType) => void;
}

const blockTypes: {
  category: string;
  blocks: (
    | {
        id: MediaBlockPlatform;
        name: string;
        icon: LucideIcon | IconType;
        type: "media";
      }
    | {
        id: "text";
        name: string;
        icon: LucideIcon | IconType;
        type: "link" | "text";
      }
  )[];
}[] = [
  {
    category: "Media Embeds",
    blocks: [
      { id: "spotify", name: "Spotify", icon: getPlatformIcon("spotify"), type: "media" },
      { id: "instagram", name: "Instagram", icon: getPlatformIcon("instagram"), type: "media" },
      { id: "youtube", name: "YouTube", icon: getPlatformIcon("youtube"), type: "media" },
      { id: "twitter", name: "X Post", icon: getPlatformIcon("twitter"), type: "media" },
      {
        id: "facebook",
        name: "Facebook Post",
        icon: getPlatformIcon("facebook"),
        type: "media",
      },
      { id: "tiktok", name: "TikTok", icon: getPlatformIcon("tiktok"), type: "media" },
    ],
  },
  // {
  //   category: 'Web3',
  //   blocks: [
  //     { id: 'token-price', name: 'Token Price', icon: DollarSign, type: 'media' },
  //     { id: 'nft-collection', name: 'NFT Collection', icon: Store, type: 'media' },
  //     { id: 'uniswap', name: 'Uniswap Swap', icon: ArrowUpRight, type: 'media' },
  //     { id: 'creator-pool', name: 'Creator Pool', icon: Users, type: 'media' },
  //   ],
  // },
  {
    category: "Utility",
    blocks: [
      // { id: "email-collect", name: "Email Collection", icon: Mail, type: "text" },
      // { id: "telegram", name: "Telegram Channel", icon: MessageCircle, type: "text" },
      { id: "text", name: "Text Block", icon: FileText, type: "text" },
      // { id: "substack", name: "Substack Feed", icon: Newspaper, type: "media" },
      // { id: "team", name: "Team Members", icon: Users, type: "text" },
    ],
  },
];

export function BlockPicker({ onAdd }: BlockPickerProps) {
  const [editingBlock, setEditingBlock] = useState<BlockType | null>(null);

  const createBlock = (blockType: string, platform: MediaBlockPlatform): BlockType => {
    if (blockType === "media") {
      return {
        id: 0,
        type: "media",
        order: 0,
        config: {
          platform: platform,
          url: "",
          label: "",
        },
      } as MediaBlock;
    } else if (blockType === "link") {
      return {
        id: 0,
        type: "link",
        order: 0,
        config: {
          platform: "custom",
          url: "",
          label: "",
        },
      } as LinkBlock;
    } else {
      return {
        id: 0,
        type: "text",
        order: 0,
        config: {
          content: "",
          platform: "text",
        },
      } as TextBlock;
    }
  };

  const handleBlockSelection = (blockType: string, platform: MediaBlockPlatform) => {
    const newBlock = createBlock(blockType, platform);
    setEditingBlock(newBlock);
  };

  const handleSave = (config: BlockType["config"]) => {
    if (editingBlock) {
      // Mantenha o mesmo tipo do bloco que estamos editando
      if (editingBlock.type === "media") {
        onAdd({
          ...editingBlock,
          config: config as MediaBlock["config"],
        } as MediaBlock);
      } else if (editingBlock.type === "link") {
        onAdd({
          ...editingBlock,
          config: config as LinkBlock["config"],
        } as LinkBlock);
      } else {
        onAdd({
          ...editingBlock,
          config: config as TextBlock["config"],
        } as TextBlock);
      }
      setEditingBlock(null);
    }
  };

  const handleCancel = () => {
    setEditingBlock(null);
  };

  return (
    <div className="space-y-6">
      {blockTypes.map(category => (
        <div key={category.category} className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">{category.category}</h3>
          <div className="grid grid-cols-2 gap-3">
            {category.blocks.map(block => (
              <button
                key={block.id}
                onClick={() => handleBlockSelection(block.type, block.id as MediaBlockPlatform)}
                className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all"
              >
                <block.icon className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{block.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {editingBlock && (
        <BlockEditor block={editingBlock} onSave={handleSave} onCancel={handleCancel} />
      )}
    </div>
  );
}

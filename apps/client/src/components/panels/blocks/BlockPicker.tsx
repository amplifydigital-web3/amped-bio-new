import {
  BlockType,
  LinkBlock,
  MediaBlock,
  MediaBlockPlatform,
  TextBlock,
  PoolBlock,
  ReferralBlock,
} from "@ampedbio/constants";
import { getPlatformIcon } from "@/utils/platforms";
import { FileText, LucideIcon, Coins, Lock, Link2 } from "lucide-react";
import { IconType } from "react-icons/lib";
import { useState } from "react";
import { BlockEditor } from "./BlockEditor";
import { TextBlockEditor } from "./TextBlockEditor";
import { useEditor } from "@/contexts/EditorContext";
import toast from "react-hot-toast";

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
        disabled?: boolean;
      }
    | {
        id: "text" | "creator-pool";
        name: string;
        icon: LucideIcon | IconType;
        type: "link" | "text" | "media";
        disabled?: boolean;
      }
    | {
        id: "pool";
        name: string;
        icon: LucideIcon | IconType;
        type: "pool";
        disabled?: boolean;
      }
    | {
        id: "referral";
        name: string;
        icon: LucideIcon | IconType;
        type: "referral";
        disabled?: boolean;
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
      { id: "vimeo", name: "Vimeo", icon: getPlatformIcon("vimeo"), type: "media" },
    ],
  },
  {
    category: "Utility",
    blocks: [
      { id: "text", name: "Text Block", icon: FileText, type: "text" },
      { id: "referral", name: "My Referral Link", icon: Link2, type: "referral" },
    ],
  },
  {
    category: "Web3",
    blocks: [{ id: "pool", name: "Creator Pool", icon: Coins, type: "pool" }],
  },
];

export function BlockPicker({ onAdd }: BlockPickerProps) {
  const [editingBlock, setEditingBlock] = useState<BlockType | null>(null);
  const { blocks } = useEditor();

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
    } else if (blockType === "pool") {
      return {
        id: 0,
        type: "pool",
        order: 0,
        config: {
          address: "",
          label: "",
        },
      } as PoolBlock;
    } else if (blockType === "referral") {
      return {
        id: 0,
        type: "referral",
        order: 0,
        config: {},
      } as ReferralBlock;
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
    const hasReferralBlock = blocks.some(b => b.type === "referral");
    if (blockType === "referral" && hasReferralBlock) {
      toast.error("You can only have one Referral Link block per profile");
      return;
    }
    const newBlock = createBlock(blockType, platform);
    if (blockType === "referral") {
      onAdd(newBlock);
    } else {
      setEditingBlock(newBlock);
    }
  };

  const handleSave = (config: BlockType["config"]) => {
    console.info("Saving block:", config);
    if (editingBlock) {
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
      } else if (editingBlock.type === "pool") {
        onAdd({
          ...editingBlock,
          config: config as PoolBlock["config"],
        } as PoolBlock);
      } else if (editingBlock.type === "referral") {
        onAdd({
          ...editingBlock,
          config: config as ReferralBlock["config"],
        } as ReferralBlock);
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
            {category.blocks.map(block => {
              const isDisabled = false;
              return (
                <button
                  key={block.id}
                  onClick={() => handleBlockSelection(block.type, block.id as MediaBlockPlatform)}
                  disabled={isDisabled}
                  className={`flex items-center space-x-3 p-3 bg-white rounded-lg border border-gray-200 transition-all ${
                    isDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:border-blue-500 hover:ring-1 hover:ring-blue-500"
                  }`}
                >
                  {isDisabled ? (
                    <Lock className="w-5 h-5 text-gray-400" />
                  ) : (
                    <block.icon className="w-5 h-5 text-gray-500" />
                  )}
                  <span className="text-sm font-medium text-gray-700">{block.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {editingBlock &&
        (() => {
          if (editingBlock.type === "text") {
            return (
              <TextBlockEditor
                block={editingBlock as TextBlock}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            );
          }
          if (editingBlock.type === "referral") {
            return null;
          }

          return <BlockEditor block={editingBlock} onSave={handleSave} onCancel={handleCancel} />;
        })()}
    </div>
  );
}

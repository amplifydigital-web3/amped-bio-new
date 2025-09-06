import {
  BlockType,
  LinkBlock,
  MediaBlock,
  MediaBlockPlatform,
  TextBlock,
} from "@ampedbio/constants";
import { getPlatformIcon } from "@/utils/platforms";
import { FileText, LucideIcon, Coins, Lock } from "lucide-react";
import { IconType } from "react-icons/lib";
import { useState } from "react";
import { BlockEditor } from "./BlockEditor";
import { TextBlockEditor } from "./TextBlockEditor";
import { useEditor } from "@/contexts/EditorContext";

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
  {
    category: "Utility",
    blocks: [{ id: "text", name: "Text Block", icon: FileText, type: "text" }],
  },
  {
    category: "Web3",
    blocks: [{ id: "creator-pool", name: "Stake in my Pool", icon: Coins, type: "media" }],
  },
];

export function BlockPicker({ onAdd }: BlockPickerProps) {
  const [editingBlock, setEditingBlock] = useState<BlockType | null>(null);
  const { hasCreatorPool } = useEditor();

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
    console.info("Saving block:", config);
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
            {category.blocks.map(block => {
              const isDisabled = block.id === "creator-pool" && !hasCreatorPool;
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

          return <BlockEditor block={editingBlock} onSave={handleSave} onCancel={handleCancel} />;
        })()}
    </div>
  );
}
import { BlockList } from "./BlockList";
import { BlockPicker } from "./BlockPicker";
import { LinkForm } from "./LinkForm";
import { useEditor } from "../../../contexts/EditorContext";
import { GripVertical } from "lucide-react";

export function BlocksPanel() {
  const { blocks, addBlock, removeBlock, updateBlock, reorderBlocks } = useEditor();

  return (
    <div className="flex flex-col">
      <div className="p-6 space-y-8">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Links</h2>
          <p className="text-sm text-gray-500">
            Add and manage your social media and other important links
          </p>
        </div>

        <LinkForm onAdd={addBlock} />
      </div>
      <div className="p-6 space-y-8">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Blocks & Media</h2>
          <p className="text-sm text-gray-500">
            Add interactive blocks and media modules to your profile
          </p>
        </div>

        <BlockPicker onAdd={addBlock} />

        {blocks.length > 0 && (
          <>
            <div className="border-t border-gray-200 my-4" />
            <p className="text-sm text-gray-500 px-1">
              You can reorder blocks by clicking and dragging the
              <span className="inline-flex items-center mx-1">
                <GripVertical className="w-4 h-4 text-gray-400" />
              </span>
              icon in each block
            </p>
          </>
        )}

        <BlockList
          blocks={blocks}
          onUpdate={updateBlock}
          onRemove={removeBlock}
          onReorder={reorderBlocks}
        />
      </div>
    </div>
  );
}

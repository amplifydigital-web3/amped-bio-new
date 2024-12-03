import React from 'react';
import { BlockList } from './BlockList';
import { BlockPicker } from './BlockPicker';
import { useEditorStore } from '../../../store/editorStore';
import type { Block } from '../../../types/editor';

export function BlocksPanel() {
  const blocks = useEditorStore((state) => state.blocks);
  const addBlock = useEditorStore((state) => state.addBlock);
  const removeBlock = useEditorStore((state) => state.removeBlock);
  const updateBlock = useEditorStore((state) => state.updateBlock);
  const reorderBlocks = useEditorStore((state) => state.reorderBlocks);

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Blocks & Media</h2>
        <p className="text-sm text-gray-500">
          Add interactive blocks and media modules to your profile
        </p>
      </div>

      <BlockPicker onAdd={addBlock} />
      
      <BlockList
        blocks={blocks}
        onUpdate={updateBlock}
        onRemove={removeBlock}
        onReorder={reorderBlocks}
      />
    </div>
  );
}
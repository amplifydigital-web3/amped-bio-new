import React from 'react';
import { LinkList } from './LinkList';
import { LinkForm } from './LinkForm';
import { useEditorStore } from '../../../store/editorStore';
import type { LinkBlock } from '../../../types/editor';

export function LinksPanel() {
  const blocks = useEditorStore((state) => state.blocks);
  const addBlock = useEditorStore((state) => state.addBlock);
  const removeBlock = useEditorStore((state) => state.removeBlock);
  const updateBlock = useEditorStore((state) => state.updateBlock);

  const linkBlocks = blocks.filter((block): block is LinkBlock => block.type === 'link');

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Links</h2>
        <p className="text-sm text-gray-500">
          Add and manage your social media and other important links
        </p>
      </div>

      <LinkForm onAdd={addBlock} />
      
      <LinkList
        links={linkBlocks}
        onUpdate={updateBlock}
        onRemove={removeBlock}
      />
    </div>
  );
}
import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from './SortableItem';
import type { Block } from '../../../types/editor';
import { BlockEditor } from './BlockEditor';

interface BlockListProps {
  blocks: Block[];
  onUpdate: (id: string, block: Partial<Block>) => void;
  onRemove: (id: string) => void;
  onReorder: (blocks: Block[]) => void;
}

export function BlockList({ blocks, onUpdate, onRemove, onReorder }: BlockListProps) {
  const [editingBlock, setEditingBlock] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      onReorder(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((block) => block.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {blocks.map((block) => (
              <SortableItem
                key={block.id}
                id={block.id}
                block={block}
                onEdit={() => setEditingBlock(block.id)}
                onRemove={() => onRemove(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editingBlock && (
        <BlockEditor
          block={blocks.find((b) => b.id === editingBlock)!}
          onSave={(updatedBlock) => {
            onUpdate(editingBlock, updatedBlock);
            setEditingBlock(null);
          }}
          onCancel={() => setEditingBlock(null)}
        />
      )}
    </div>
  );
}
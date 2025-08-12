import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableItem } from "./SortableItem";
import { BlockEditor } from "./BlockEditor";
import { TextBlockEditor } from "./TextBlockEditor";
import { type BlockType, type TextBlock } from "@ampedbio/constants";

interface BlockListProps {
  blocks: BlockType[];
  onUpdate: (id: number, block: BlockType["config"]) => void;
  onRemove: (id: number) => void;
  onReorder: (blocks: BlockType[]) => void;
}

export function BlockList({ blocks, onUpdate, onRemove, onReorder }: BlockListProps) {
  const [editingBlock, setEditingBlock] = React.useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Convert string IDs back to numbers for finding indexes
      const activeId = Number(active.id);
      const overId = Number(over.id);

      const oldIndex = blocks.findIndex(block => block.id === activeId);
      const newIndex = blocks.findIndex(block => block.id === overId);

      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(blocks, oldIndex, newIndex));
      }
    }
  };

  // Create a consistent list of IDs for SortableContext
  const itemIds = blocks.map(block => String(block.id));

  console.log("blocks", blocks);

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map(block => (
              <SortableItem
                key={block.id}
                id={String(block.id)}
                block={block}
                onEdit={() => setEditingBlock(block.id)}
                onRemove={() => onRemove(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editingBlock && (() => {
        const block = blocks.find(b => b.id === editingBlock)!;
        
        if (block.type === "text") {
          return (
            <TextBlockEditor
              block={block as TextBlock}
              onSave={updatedBlock => {
                onUpdate(editingBlock, updatedBlock);
                setEditingBlock(null);
              }}
              onCancel={() => setEditingBlock(null)}
            />
          );
        }
        
        return (
          <BlockEditor
            block={block}
            onSave={updatedBlock => {
              onUpdate(editingBlock, updatedBlock);
              setEditingBlock(null);
            }}
            onCancel={() => setEditingBlock(null)}
          />
        );
      })()}
    </div>
  );
}

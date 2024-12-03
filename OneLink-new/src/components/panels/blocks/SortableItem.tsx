import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Settings } from 'lucide-react';
import type { Block } from '../../../types/editor';
import { getPlatformIcon } from '../../../utils/platforms';

interface SortableItemProps {
  id: string;
  block: Block;
  onEdit: () => void;
  onRemove: () => void;
}

export function SortableItem({ id, block, onEdit, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  const Icon = block.type === 'link' ? getPlatformIcon(block.platform) : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-3 p-3 rounded-lg border group ${
        isDragging
          ? 'bg-blue-50 border-blue-200 shadow-lg'
          : 'bg-white border-gray-200'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none"
        aria-label="Drag handle"
      >
        <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
      </button>
      
      <div className="flex-1 flex items-center space-x-3 min-w-0">
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">
            {block.type === 'link' ? block.label : block.type === 'media' ? block.mediaType : 'Text Block'}
          </p>
          <p className="text-sm text-gray-500 truncate">
            {block.type === 'link' ? block.url : block.content || 'Empty block'}
          </p>
        </div>
      </div>
      
      <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 text-gray-500 hover:text-gray-700"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
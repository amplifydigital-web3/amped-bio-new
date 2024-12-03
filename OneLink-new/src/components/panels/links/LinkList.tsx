import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@dnd-kit/core';
import { GripVertical, Trash2, ExternalLink } from 'lucide-react';
import type { LinkBlock } from '../../../types/editor';
import { getPlatformIcon } from '../../../utils/platforms';

interface LinkListProps {
  links: LinkBlock[];
  onUpdate: (id: string, block: Partial<LinkBlock>) => void;
  onRemove: (id: string) => void;
}

export function LinkList({ links, onUpdate, onRemove }: LinkListProps) {
  return (
    <div className="space-y-2">
      {links.map((link) => {
        const Icon = getPlatformIcon(link.platform);
        
        return (
          <div
            key={link.id}
            className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg group"
          >
            <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
            
            <div className="flex-1 flex items-center space-x-3">
              <Icon className="w-5 h-5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{link.label}</p>
                <p className="text-sm text-gray-500 truncate">{link.url}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={() => onRemove(link.id)}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
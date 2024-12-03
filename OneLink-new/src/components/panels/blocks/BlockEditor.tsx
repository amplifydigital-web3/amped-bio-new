import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import { Button } from '../../ui/Button';
import type { Block } from '../../../types/editor';

interface BlockEditorProps {
  block: Block;
  onSave: (block: Partial<Block>) => void;
  onCancel: () => void;
}

export function BlockEditor({ block, onSave, onCancel }: BlockEditorProps) {
  const [content, setContent] = useState(block.content);

  const handleSave = () => {
    onSave({ content });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Edit {block.type === 'media' ? block.mediaType : 'Text'} Block
          </h3>
          <button
            onClick={onCancel}
            className="p-1 text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {block.type === 'media' ? (
            <Input
              label="Content URL"
              type="url"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter media URL"
            />
          ) : (
            <Textarea
              label="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your text content"
              rows={4}
            />
          )}

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
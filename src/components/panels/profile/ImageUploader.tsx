import React, { useCallback, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { PhotoEditor } from './PhotoEditor';
import { Input } from '../../ui/Input';

interface ImageUploaderProps {
  imageUrl: string;
  onImageChange: (url: string) => void;
}

export function ImageUploader({ imageUrl, onImageChange }: ImageUploaderProps) {
  const [editingImage, setEditingImage] = useState<string | null>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleImageURL = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    onImageChange(url);
  }

  const handleSaveEdit = (editedImage: string) => {
    onImageChange(editedImage);
    setEditingImage(null);
  };

  return (
    <>
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover"
              />
              <button
                onClick={() => onImageChange('')}
                className="absolute -top-2 -right-2 p-1 bg-white rounded-full shadow-md hover:bg-gray-50"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </>
          ) : (
            <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center">
              <Camera className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>

        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />
          <span className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
            {imageUrl ? 'Change Photo' : 'Upload Photo'}
          </span>
        </label>
        <Input
          label="Photo URL"
          value={imageUrl || ''}
          onChange={handleImageURL}
          placeholder="Photo URL"
        />
      </div>

      {editingImage && (
        <PhotoEditor
          imageUrl={editingImage}
          onSave={handleSaveEdit}
          onCancel={() => setEditingImage(null)}
        />
      )}
    </>
  );
}
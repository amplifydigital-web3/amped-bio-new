import React, { useCallback } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";

interface ImageUploaderProps {
  onUpload: (image: { url: string; type: string }) => void;
}

export function ImageUploader({ onUpload }: ImageUploaderProps) {
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          onUpload({
            url: reader.result as string,
            type: file.type,
          });
        };
        reader.readAsDataURL(file);
      }
    },
    [onUpload]
  );

  return (
    <label className="block">
      <div className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
        <div className="flex items-center space-x-2 text-gray-600">
          <Upload className="w-5 h-5" />
          <ImageIcon className="w-5 h-5" />
        </div>
        <p className="mt-2 text-sm text-gray-500">Drop your images here or click to upload</p>
        <p className="text-xs text-gray-400 mt-1">Supports: JPG, PNG, GIF, WebP</p>
      </div>
      <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
    </label>
  );
}

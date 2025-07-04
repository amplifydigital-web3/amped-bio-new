import React, { useCallback } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import {
  ALLOWED_AVATAR_FILE_EXTENSIONS,
  ALLOWED_AVATAR_FILE_TYPES,
  MAX_AVATAR_FILE_SIZE,
} from "@ampedbio/constants";

interface ImageUploaderProps {
  onUpload: (image: { url: string; type: string }) => void;
}

export function AvatarImageUploader({ onUpload }: ImageUploaderProps) {
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!ALLOWED_AVATAR_FILE_TYPES.includes(file.type)) {
        alert(`Only ${ALLOWED_AVATAR_FILE_TYPES.join(", ").toUpperCase()} images are allowed`);
        return;
      }

      // Validate file extension
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_AVATAR_FILE_EXTENSIONS.includes(fileExtension)) {
        alert(`Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ")} file extensions are allowed`);
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > MAX_AVATAR_FILE_SIZE) {
        alert(`File size must be less than ${MAX_AVATAR_FILE_SIZE / (1024 * 1024)}MB`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        onUpload({
          url: reader.result as string,
          type: file.type,
        });
      };
      reader.readAsDataURL(file);
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
        <p className="text-xs text-gray-400 mt-1">
          Supports: {ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ").toUpperCase()} (Max{" "}
          {MAX_AVATAR_FILE_SIZE / (1024 * 1024)}MB)
        </p>
      </div>
      <input
        type="file"
        className="hidden"
        accept={ALLOWED_AVATAR_FILE_TYPES.join(",")}
        onChange={handleFileUpload}
      />
    </label>
  );
}

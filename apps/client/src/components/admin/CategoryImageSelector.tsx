import { useState, useRef, ChangeEvent } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { ALLOWED_AVATAR_FILE_EXTENSIONS, ALLOWED_AVATAR_FILE_TYPES, MAX_AVATAR_FILE_SIZE } from "@ampedbio/constants";

interface CategoryImageSelectorProps {
  onFileSelect: (file: File | null) => void;
  onError?: (error: string) => void;
  selectedFile?: File | null;
}

export function CategoryImageSelector({ 
  onFileSelect, 
  onError,
  selectedFile 
}: CategoryImageSelectorProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    if (!file) {
      onFileSelect(null);
      setPreviewUrl(null);
      return;
    }

    // Reset file input
    e.target.value = '';

    // Validate file type
    if (!ALLOWED_AVATAR_FILE_TYPES.includes(file.type)) {
      const errorMsg = `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(', ').toUpperCase()} images are allowed`;
      onError?.(errorMsg);
      return;
    }

    // Validate file extension
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_AVATAR_FILE_EXTENSIONS.includes(fileExtension)) {
      const errorMsg = `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(', ')} file extensions are allowed`;
      onError?.(errorMsg);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > MAX_AVATAR_FILE_SIZE) {
      const errorMsg = `File size must be less than ${(MAX_AVATAR_FILE_SIZE / (1024 * 1024)).toFixed(2)}MB`;
      onError?.(errorMsg);
      return;
    }

    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    onFileSelect(file);
  };

  const clearSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Category Image (Optional)</label>
      
      {/* Preview */}
      {previewUrl && (
        <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={clearSelection}
            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      
      {/* Upload Button */}
      <div className="flex items-center gap-3">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={ALLOWED_AVATAR_FILE_TYPES.join(',')}
          onChange={handleFileSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {selectedFile ? (
            <>
              <ImageIcon className="w-4 h-4 mr-2" />
              Change Image
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Select Image
            </>
          )}
        </button>
        
        {selectedFile && (
          <span className="text-sm text-gray-600">
            {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
          </span>
        )}
      </div>
      
      {/* File Requirements */}
      <p className="text-xs text-gray-500">
        {ALLOWED_AVATAR_FILE_EXTENSIONS.join(', ').toUpperCase()}. Max {MAX_AVATAR_FILE_SIZE / (1024 * 1024)}MB.
      </p>
    </div>
  );
}

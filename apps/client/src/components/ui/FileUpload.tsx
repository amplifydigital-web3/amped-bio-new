import React, { useRef, useState, useCallback, DragEvent } from "react";
import { Upload, Loader2 } from "lucide-react";

interface UseFileUploadProps {
  acceptedExtensions: string[];
  maxFileSize?: number;
  onFileSelect: (file: File) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export const useFileUpload = ({
  acceptedExtensions,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  onFileSelect,
  onError,
  disabled = false,
}: UseFileUploadProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file extension
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!acceptedExtensions.includes(fileExtension)) {
        return `Unsupported file extension. Allowed extensions: ${acceptedExtensions.join(", ")}`;
      }

      // Check file size
      if (file.size > maxFileSize) {
        return `File too large. Maximum size: ${maxFileSize / (1024 * 1024)}MB`;
      }

      return null;
    },
    [acceptedExtensions, maxFileSize]
  );

  const handleFileSelection = useCallback(
    (file: File) => {
      const error = validateFile(file);
      if (error) {
        onError?.(error);
        return;
      }

      onFileSelect(file);
    },
    [validateFile, onFileSelect, onError]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset the file input to allow selecting the same file again
      e.target.value = "";

      handleFileSelection(file);
    },
    [handleFileSelection]
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      const file = files[0];

      if (file) {
        handleFileSelection(file);
      }
    },
    [disabled, handleFileSelection]
  );

  const openFileDialog = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  return {
    fileInputRef,
    isDragOver,
    handleFileInputChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    openFileDialog,
    acceptString: acceptedExtensions
      .map(ext => {
        // Map common extensions to MIME types
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          svg: "image/svg+xml",
          mp4: "video/mp4",
          mov: "video/quicktime",
          avi: "video/x-msvideo",
          webm: "video/webm",
        };
        return mimeMap[ext] || `.${ext}`;
      })
      .join(","),
  };
};

interface FileUploadProps {
  acceptedExtensions: string[];
  maxFileSize?: number;
  onFileSelect: (file: File) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  title?: string;
  description?: string;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  acceptedExtensions,
  maxFileSize = 10 * 1024 * 1024,
  onFileSelect,
  onError,
  disabled = false,
  isLoading = false,
  title = "Upload file",
  description,
  className = "",
}) => {
  const {
    fileInputRef,
    isDragOver,
    handleFileInputChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    openFileDialog,
    acceptString,
  } = useFileUpload({
    acceptedExtensions,
    maxFileSize,
    onFileSelect,
    onError,
    disabled,
  });

  const defaultDescription = `Accepted: ${acceptedExtensions.join(", ").toUpperCase()} (Max ${maxFileSize / (1024 * 1024)}MB)`;

  return (
    <div className={className}>
      <div
        className={`w-full h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors ${
          isLoading
            ? "border-blue-300 cursor-default"
            : disabled
              ? "border-gray-300 cursor-not-allowed opacity-70"
              : isDragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-500 cursor-pointer"
        }`}
        onClick={openFileDialog}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="text-sm text-gray-600">Uploading file...</span>
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 text-gray-400 mb-2" />
            <span className="text-sm text-gray-500">{title}</span>
            <p className="text-xs text-gray-400 mt-1 text-center px-2">
              {description || defaultDescription}
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={acceptString}
        onChange={handleFileInputChange}
        disabled={disabled || isLoading}
      />
    </div>
  );
};

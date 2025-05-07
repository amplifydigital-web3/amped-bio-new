import { useState, useRef, ChangeEvent } from "react";
import { trpc } from "../../../utils/trpc";
import axios, { CancelTokenSource } from "axios";
import { PhotoEditor } from "./PhotoEditor";
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "@ampedbio/constants";

interface ImageUploaderProps {
  imageUrl: string;
  onImageChange: (url: string) => void;
}

export function ImageUploader({ imageUrl, onImageChange }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);
  
  // New state for photo editor
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string>("");

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError(`Only ${ALLOWED_FILE_EXTENSIONS.join(', ').toUpperCase()} images are allowed`);
      return;
    }

    // Validate file extension
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
      setError(`Only ${ALLOWED_FILE_EXTENSIONS.join(', ')} file extensions are allowed`);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 5MB");
      return;
    }

    // Clear previous error
    setError(null);
    
    // Store the file for later use
    setSelectedFile(file);
    
    // Create URL for the image to edit
    const imageUrl = URL.createObjectURL(file);
    setEditingImageUrl(imageUrl);
    
    // Open the photo editor
    setIsEditorOpen(true);
  };

  const handleEditorSave = async (editedImageUrl: string) => {
    // Close editor
    setIsEditorOpen(false);
    
    // Start upload process with edited image
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Convert data URL to Blob
      const response = await fetch(editedImageUrl);
      
      const blob = await response.blob();
      
      // Create a file from the blob with the original file name and type
      const fileType = selectedFile?.type || "image/jpeg";
      const fileName = selectedFile?.name || "edited-image.jpg";
      const editedFile = new File([blob], fileName, { type: fileType });
      
      // Check file size again after editing
      if (editedFile.size > MAX_FILE_SIZE) {
        throw new Error("The edited image exceeds the maximum size of 5MB");
      }
      
      // Get file extension
      const fileExtension = fileName.split(".").pop()?.toLowerCase() || "jpg";
      
      // Request presigned URL from server
      const presignedData = await trpc.user.requestPresignedUrl.mutate({
        contentType: fileType,
        fileExtension: fileExtension,
        fileSize: editedFile.size,
        category: "profiles"
      });

      // Create a cancel token source for this upload
      cancelTokenRef.current = axios.CancelToken.source();
      
      // Upload file to S3 using the presigned URL with Axios
      const uploadResponse = await axios.put(presignedData.presignedUrl, editedFile, {
        headers: {
          'Content-Type': fileType
        },
        cancelToken: cancelTokenRef.current.token,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total!);
          setUploadProgress(percentCompleted);
        }
      });
      
      // Check if the upload was successful (S3 returns 200 on success)
      if (uploadResponse.status !== 200) {
        throw new Error(`Upload failed with status: ${uploadResponse.status}`);
      }
      
      // Confirm upload with the server
      const result = await trpc.user.confirmProfilePictureUpload.mutate({
        fileKey: presignedData.fileKey,
        category: "profiles"
      });
      
      // Update the profile with the new image URL
      onImageChange(result.profilePictureUrl);
      
    } catch (error: any) {
      if (axios.isCancel(error)) {
        setError("Upload was cancelled");
      } else {
        console.error("Error in upload process:", error);
        setError(error?.message || "Failed to upload image");
      }
    } finally {
      setIsUploading(false);
      cancelTokenRef.current = null;
      // Clean up URL object to avoid memory leaks
      URL.revokeObjectURL(editingImageUrl);
      setEditingImageUrl("");
      setSelectedFile(null);
    }
  };
  
  const handleEditorCancel = () => {
    setIsEditorOpen(false);
    // Clean up URL object to avoid memory leaks
    URL.revokeObjectURL(editingImageUrl);
    setEditingImageUrl("");
    setSelectedFile(null);
  };

  const handleCancelUpload = () => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel("Upload cancelled by user");
      cancelTokenRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      {isEditorOpen && editingImageUrl && (
        <PhotoEditor
          imageUrl={editingImageUrl}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
        />
      )}
      
      <div className="flex items-center space-x-6">
        {/* Current Profile Image */}
        <div className="relative h-24 w-24 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt="Profile" 
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-50">
              <svg 
                className="h-12 w-12 text-gray-300" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          )}
          
          {isUploading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="text-white text-xs font-medium">
                {uploadProgress}%
              </div>
            </div>
          )}
        </div>

        {/* Upload Controls */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept={ALLOWED_FILE_TYPES.join(',')}
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isEditorOpen}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "Uploading..." : "Change photo"}
            </button>
            
            {isUploading && (
              <button
                type="button"
                onClick={handleCancelUpload}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {ALLOWED_FILE_EXTENSIONS.join(', ').toUpperCase()}. Max {MAX_FILE_SIZE / (1024 * 1024)}MB.
          </p>
          {error && (
            <p className="text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

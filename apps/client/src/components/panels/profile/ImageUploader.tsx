import { useState, useRef, ChangeEvent } from "react";
import { trpc } from "../../../utils/trpc";
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "@ampedbio/constants";
import { PhotoEditor } from "./PhotoEditor";

interface ImageUploaderProps {
  imageUrl: string;
  onImageChange: (url: string) => void;
}

export function ImageUploader({ imageUrl, onImageChange }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    
    // Create a preview URL for the photo editor
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSelectedFile(file);
    setShowPhotoEditor(true);
  };

  const handleEditCancel = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setShowPhotoEditor(false);
  };

  const handleEditComplete = async (editedImageDataUrl: string) => {
    setShowPhotoEditor(false);
    
    // Clean up the preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Convert data URL to File object
    const dataUrlParts = editedImageDataUrl.split(',');
    const byteString = atob(dataUrlParts[1]);
    const mimeType = dataUrlParts[0].split(':')[1].split(';')[0];
    
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    // Create file name with correct extension based on mime type
    let fileExtension = 'jpg';
    if (mimeType === 'image/png') fileExtension = 'png';
    if (mimeType === 'image/gif') fileExtension = 'gif';
    
    const editedFile = new File([ab], `profile-photo.${fileExtension}`, { type: mimeType });
    
    // Upload the edited file
    await handleUpload(editedFile);
  };

  const handleUpload = async (file: File) => {
    // Start upload process
    setIsUploading(true);

    try {
      const fileType = file.type;
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      
      console.log("Preparing to upload file with:", {
        contentType: fileType,
        fileExtension,
        fileName: file.name,
        fileSize: file.size
      });
      
      // Request presigned URL from server
      const presignedData = await trpc.user.requestPresignedUrl.mutate({
        contentType: fileType,
        fileExtension: fileExtension,
        fileSize: file.size,
        category: "profiles"
      });
      
      console.log("Server response - presigned URL data:", presignedData);
      
      try {
        // Use the successful approach from s3uploadpresigned.ts script
        console.log("Starting S3 upload with presigned URL...");
        
        const uploadResponse = await fetch(presignedData.presignedUrl, {
          method: 'PUT',
          body: file, // Use the raw file object
          headers: {
            'Content-Type': fileType
          }
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error("S3 upload failed with response:", errorText);
          throw new Error(`Upload failed with status: ${uploadResponse.status}`);
        }
        
        console.log("S3 upload completed successfully:", uploadResponse.status);
        
        // Confirm upload with the server
        const result = await trpc.user.confirmProfilePictureUpload.mutate({
          fileKey: presignedData.fileKey,
          category: "profiles"
        });
        
        console.log("Server response - upload confirmation:", result);
        
        // Update the profile with the new image URL
        onImageChange(result.profilePictureUrl);
        
      } catch (uploadError: any) {
        console.error("S3 upload error:", uploadError);
        console.error("Upload error details:", {
          message: uploadError?.message,
          response: uploadError?.response?.data || uploadError?.response
        });
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }
    } catch (error: any) {
      console.error("Error in upload process:", error);
      console.error("Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      });
      setError(error?.message || "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
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
              disabled={isUploading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "Uploading..." : "Change photo"}
            </button>
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
      {showPhotoEditor && previewUrl && (
        <PhotoEditor
          imageUrl={previewUrl}
          onCancel={handleEditCancel}
          onComplete={handleEditComplete}
        />
      )}
    </div>
  );
}

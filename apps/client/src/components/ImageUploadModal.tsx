import React, { useState, useCallback } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/Button";
import { FileUpload } from "./ui/FileUpload";
import { trpcClient } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ALLOWED_POOL_IMAGE_FILE_EXTENSIONS } from "@ampedbio/constants";

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (fileId: number, imageUrl: string) => void;
  currentImageUrl?: string;
}

const MAX_FILE_SIZE_MB = 5; // Example max file size for pool images

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  currentImageUrl,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const requestPresignedUrlMutation = useMutation({
    mutationFn: trpcClient.pools.creator.requestPoolImagePresignedUrl.mutate,
    onSuccess: data => {
      // Handle S3 upload here
      uploadFileToS3(data.presignedUrl, file!)
        .then(() => {
          confirmUploadMutation.mutate({
            fileId: data.fileId,
            fileName: file!.name,
          });
        })
        .catch(error => {
          console.error("S3 upload failed:", error);
          toast.error("Image upload failed. Please try again.");
        });
    },
    onError: error => {
      console.error("Request presigned URL failed:", error);
      toast.error("Failed to get upload URL. " + error.message);
    },
  });

  const confirmUploadMutation = useMutation({
    mutationFn: trpcClient.pools.creator.confirmPoolImageUpload.mutate,
    onSuccess: data => {
      toast.success("Image uploaded successfully!");
      onUploadSuccess(data.fileId, data.poolImageUrl);
      onClose();
    },
    onError: error => {
      console.error("Confirm upload failed:", error);
      toast.error("Failed to confirm upload. " + error.message);
    },
  });

  const uploadFileToS3 = async (presignedUrl: string, fileToUpload: File) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presignedUrl);
      xhr.setRequestHeader("Content-Type", fileToUpload.type);

      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(true);
        } else {
          reject(new Error(`S3 upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error("S3 upload failed due to network error."));
      };

      xhr.send(fileToUpload);
    });
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setUploadProgress(0);
  }, []);

  const handleFileError = useCallback((error: string) => {
    toast.error(error);
  }, []);

  const handleUpload = () => {
    if (!file) {
      toast.error("Please select a file to upload.");
      return;
    }

    requestPresignedUrlMutation.mutate({
      contentType: file.type,
      fileExtension: file.name.split(".").pop()!,
      fileSize: file.size,
    });
  };

  const handleClose = () => {
    setFile(null);
    setPreview(currentImageUrl || null);
    setUploadProgress(0);
    onClose();
  };

  const isLoading = requestPresignedUrlMutation.isPending || confirmUploadMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Upload Pool Image</DialogTitle>
          <DialogDescription>
            Upload a new image for your pool. Max file size: {MAX_FILE_SIZE_MB}MB.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <FileUpload
            acceptedExtensions={ALLOWED_POOL_IMAGE_FILE_EXTENSIONS}
            maxFileSize={MAX_FILE_SIZE_MB * 1024 * 1024}
            onFileSelect={handleFileSelect}
            onError={handleFileError}
            disabled={isLoading}
            isLoading={isLoading}
            title="Upload an image"
            description={`Accepted: ${ALLOWED_POOL_IMAGE_FILE_EXTENSIONS.join(", ").toUpperCase()} (Max ${MAX_FILE_SIZE_MB}MB)`}
          />
          {file && (
            <div className="flex flex-col items-center mt-4">
              {preview && (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-32 h-32 object-cover rounded-lg mb-3"
                />
              )}
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              <Button variant="outline" size="sm" onClick={() => setFile(null)} className="mt-2">
                Remove
              </Button>
            </div>
          )}
          {isLoading && uploadProgress > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          )}
        </div>
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-4 w-4" />
            )}
            {isLoading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

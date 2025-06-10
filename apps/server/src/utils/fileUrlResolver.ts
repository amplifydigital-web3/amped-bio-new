import { uploadedFileService } from "../services/UploadedFileService";
import { s3Service } from "../services/S3Service";

export interface FileUrlParams {
  imageField: string | null;
  imageFileId: number | null;
}

/**
 * Helper function to get file URL from either file ID or legacy URL
 */
export async function getFileUrl(params: FileUrlParams): Promise<string | null> {
  const { imageField, imageFileId } = params;
  
  // If we have a file ID, use the new system
  // No need to check status since the file ID only exists after successful upload confirmation
  if (imageFileId) {
    const uploadedFile = await uploadedFileService.getFileById(imageFileId);
    if (uploadedFile) {
      return s3Service.getFileUrl(uploadedFile.s3_key);
    }
    return null;
  }

  // If we have a legacy URL, return it directly
  if (imageField) {
    return imageField;
  }

  return null;
}

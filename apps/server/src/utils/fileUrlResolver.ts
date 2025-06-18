import { uploadedFileService } from "../services/UploadedFileService";
import { s3Service } from "../services/S3Service";

export interface FileUrlParams {
  /**
   * Legacy image field URL, used for backward compatibility
   * This is the old URL format that may still be in use
   */
  legacyImageField: string | null;
  /**
   * New image file ID, used for the new upload system
   * This is the ID of the file stored in the new system
   */
  imageFileId: number | null;
}

/**
 * Helper function to get file URL from either file ID or legacy URL
 */
export async function getFileUrl(params: FileUrlParams): Promise<string | null> {
  const { legacyImageField, imageFileId } = params;
  
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
  if (legacyImageField) {
    return legacyImageField;
  }

  return null;
}

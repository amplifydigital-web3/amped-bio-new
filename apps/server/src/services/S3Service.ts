import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { env } from '../env';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '@ampedbio/constants';

export type FileCategory = 'profiles' | 'backgrounds' | 'media' | 'files';

class S3Service {
  private s3Client: S3Client;
  private bucketName: string;
  private bucketRegion: string;
  private publicBaseUrl: string;

  constructor() {
    this.bucketRegion = env.AWS_REGION;
    this.bucketName = env.AWS_S3_BUCKET_NAME;
    
    const clientOptions: any = {
      region: this.bucketRegion,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      }
    };

    // Add custom endpoint if provided (for local development with S3Mock or other S3-compatible services)
    if (env.AWS_S3_ENDPOINT) {
      clientOptions.endpoint = env.AWS_S3_ENDPOINT;
      clientOptions.forcePathStyle = true; // Required for S3-compatible services
    }
    
    this.s3Client = new S3Client(clientOptions);

    // Set the base URL for public access to files
    // AWS_S3_PUBLIC_URL should be "https://amped-bio.s3.amazonaws.com"
    if (env.AWS_S3_PUBLIC_URL) {
      // Use the specified public URL (e.g., "https://amped-bio.s3.amazonaws.com")
      this.publicBaseUrl = env.AWS_S3_PUBLIC_URL;
    } else {
      // Default S3 URL format: https://[bucket-name].s3.[region].amazonaws.com
      this.publicBaseUrl = `https://${this.bucketName}.s3.${this.bucketRegion}.amazonaws.com`;
    }
  }

  /**
   * Validate file type and size
   */
  validateFile(contentType: string, fileSize?: number): { valid: boolean; message?: string } {
    // Check file type
    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      return { 
        valid: false, 
        message: `Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}` 
      };
    }

    // Check file size if provided
    if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
      return {
        valid: false,
        message: `File size exceeds the maximum allowed size of 5MB`
      };
    }

    return { valid: true };
  }

  /**
   * Generate a unique file key for an uploaded file
   */
  generateUniqueFileKey(category: FileCategory, userId: number, fileExtension: string): string {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    
    // Use simple folder structure using just the category name
    return `${category}/${timestamp}-${randomString}-${userId}.${fileExtension}`;
  }

  /**
   * Get a pre-signed URL for client-side file upload
   */
  async getPresignedUploadUrl(
    category: FileCategory,
    userId: number, 
    contentType: string, 
    fileExtension: string
  ): Promise<{
    presignedUrl: string;
    fileKey: string;
  }> {
    // Validate file type
    const validation = this.validateFile(contentType);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    
    const fileKey = this.generateUniqueFileKey(category, userId, fileExtension);
    
    const putObjectCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
      ContentType: contentType,
      // Set the maximum size for this upload
      ContentLength: MAX_FILE_SIZE
    });

    const presignedUrl = await getSignedUrl(this.s3Client, putObjectCommand, {
      expiresIn: 300, // URL expires in 5 minutes
    });

    return {
      presignedUrl,
      fileKey,
    };
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(fileKey: string): Promise<void> {
    const deleteObjectCommand = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
    });

    await this.s3Client.send(deleteObjectCommand);
  }

  /**
   * Get the full public URL for a file
   */
  getFileUrl(fileKey: string): string {
    return `${this.publicBaseUrl}/${fileKey}`;
  }

  /**
   * Extract file key from a full S3 URL
   */
  extractFileKeyFromUrl(url: string): string | null {
    if (!url) return null;
    
    try {
      // Try to extract the key from a full S3 URL
      const urlObject = new URL(url);
      const pathParts = urlObject.pathname.split('/');
      // Remove the first empty string (from leading slash)
      pathParts.shift();
      return pathParts.join('/');
    } catch (error) {
      // If it's not a valid URL, it might already be just a key
      if (url.startsWith('profiles/') || 
          url.startsWith('backgrounds/') || 
          url.startsWith('media/') ||
          url.startsWith('files/')) {
        return url;
      }
      return null;
    }
  }
}

export const s3Service = new S3Service();
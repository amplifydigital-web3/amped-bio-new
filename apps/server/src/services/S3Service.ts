import { S3Client, PutObjectCommand, DeleteObjectCommand, type S3ClientConfig } from '@aws-sdk/client-s3';
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
    
    const clientOptions: S3ClientConfig = {
      region: this.bucketRegion,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      }
    };

    // Set the base URL for public access to files
    if (env.AWS_S3_PUBLIC_URL) {
      // Use the specified public URL directly without modification
      this.publicBaseUrl = env.AWS_S3_PUBLIC_URL;
    } else {
      // Only use bucket name and region if no public URL is provided
      this.publicBaseUrl = `https://${this.bucketName}.s3.amazonaws.com`;
    }

    // Add custom endpoint if provided (for local development with S3Mock or other S3-compatible services)
    if (env.AWS_S3_ENDPOINT.length > 0) {
      clientOptions.endpoint = env.AWS_S3_ENDPOINT;
      clientOptions.forcePathStyle = true; // Required for S3-compatible services
    } 
    // When using a custom public URL, configure S3 client accordingly
    else if (env.AWS_S3_PUBLIC_URL) {
      try {
        const urlObj = new URL(env.AWS_S3_PUBLIC_URL);
        
        // For S3 endpoints like s3.amazonaws.com, we need to specify the bucket in a different way
        // to prevent the SDK from generating URLs with duplicate bucket names
        if (urlObj.host.includes('s3.amazonaws.com')) {
          // Don't use forcePathStyle when the URL already has correct style
          // This helps AWS SDK construct correct URLs without adding bucket name in path
          clientOptions.forcePathStyle = false;
          
          // If the URL doesn't include the bucket in the host but is a standard S3 URL,
          // we need to adjust the endpoint configuration
          if (!urlObj.host.startsWith(this.bucketName)) {
            // For standard S3 URLs that don't include bucket in host,
            // using a virtual-hosted style URL
            const bucketDomain = `${this.bucketName}.s3.amazonaws.com`;
            clientOptions.endpoint = `https://${bucketDomain}`;
          } else {
            // Standard host already includes bucket
            clientOptions.endpoint = `https://${urlObj.host}`;
          }
        } else {
          // For custom domains or other S3-compatible services,
          // use the host as is and enable path style
          clientOptions.endpoint = `https://${urlObj.host}`;
          clientOptions.forcePathStyle = true;
        }
        
        console.info('[INFO] Configured S3 client for custom endpoint', 
          JSON.stringify({ 
            endpoint: clientOptions.endpoint,
            forcePathStyle: clientOptions.forcePathStyle
          }));
      } catch (error) {
        console.warn('[WARN] Failed to parse AWS_S3_PUBLIC_URL', error);
      }
    }
    
    this.s3Client = new S3Client(clientOptions);

    console.info('[INFO] S3Service initialized', JSON.stringify({ 
      bucketName: this.bucketName, 
      region: this.bucketRegion,
      publicBaseUrl: this.publicBaseUrl,
      customEndpoint: clientOptions.endpoint || 'default AWS',
      forcePathStyle: clientOptions.forcePathStyle || false
    }));
  }

  /**
   * Validate file type and size
   */
  validateFile(contentType: string, fileSize?: number): { valid: boolean; message?: string } {
    // Check file type
    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      console.info('[INFO] File validation failed: Invalid file type', JSON.stringify({ 
        contentType, 
        allowedTypes: ALLOWED_FILE_TYPES 
      }));
      return { 
        valid: false, 
        message: `Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}` 
      };
    }

    // Check file size if provided
    if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
      console.info('[INFO] File validation failed: File size exceeds limit', JSON.stringify({ 
        fileSize, 
        maxSize: MAX_FILE_SIZE 
      }));
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
    const fileKey = `${category}/${timestamp}-${randomString}-${userId}.${fileExtension}`;
    
    console.info('[INFO] Generated unique file key', JSON.stringify({ fileKey, category, userId }));
    return fileKey;
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
    try {
      // Validate file type
      const validation = this.validateFile(contentType);
      if (!validation.valid) {
        console.error('[ERROR] Failed to generate presigned URL', validation.message, JSON.stringify({
          category, userId, contentType
        }));
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

      try {
        // Parse URL to log details for debugging
        const urlObj = new URL(presignedUrl);
        console.info('[INFO] Generated presigned upload URL', JSON.stringify({ 
          fileKey, 
          userId, 
          category,
          contentType,
          presignedUrlHost: urlObj.host,
          presignedUrlOrigin: urlObj.origin,
          bucketInPath: urlObj.pathname.includes(`/${this.bucketName}/`),
          expiresIn: '5 minutes'
        }));
      } catch (error) {
        console.warn('[WARN] Failed to parse presigned URL for logging', error);
      }

      return {
        presignedUrl,
        fileKey,
      };
    } catch (error) {
      console.error('[ERROR] Error generating presigned URL', 
        error instanceof Error ? error.stack : error, 
        JSON.stringify({ category, userId, contentType }));
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(fileKey: string): Promise<void> {
    try {
      const deleteObjectCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(deleteObjectCommand);
      console.info('[INFO] File deleted successfully', JSON.stringify({ fileKey }));
    } catch (error) {
      console.error('[ERROR] Error deleting file', 
        error instanceof Error ? error.stack : error, 
        JSON.stringify({ fileKey }));
      throw error;
    }
  }

  /**
   * Get the full public URL for a file
   */
  getFileUrl(fileKey: string): string {
    // Handle case where publicBaseUrl might already have a trailing slash
    const baseUrl = this.publicBaseUrl.endsWith('/') 
      ? this.publicBaseUrl.slice(0, -1) 
      : this.publicBaseUrl;
      
    const url = `${baseUrl}/${fileKey}`;
    console.info('[INFO] Generated public file URL', JSON.stringify({ fileKey, url }));
    return url;
  }

  /**
   * Extract file key from a full S3 URL
   */
  extractFileKeyFromUrl(url: string): string | null {
    if (!url) {
      console.info('[INFO] Cannot extract file key from empty URL');
      return null;
    }
    
    try {
      // Try to extract the key from a full S3 URL
      const urlObject = new URL(url);
      const pathParts = urlObject.pathname.split('/');
      // Remove the first empty string (from leading slash)
      pathParts.shift();
      
      // Check if the bucket name is in the path (common with some S3 URL formats)
      // and remove it if it's present
      if (pathParts.length > 0 && pathParts[0] === this.bucketName) {
        pathParts.shift();
      }
      
      const fileKey = pathParts.join('/');
      
      console.info('[INFO] Extracted file key from URL', JSON.stringify({ url, fileKey }));
      return fileKey;
    } catch (error) {
      // If it's not a valid URL, it might already be just a key
      if (url.startsWith('profiles/') || 
          url.startsWith('backgrounds/') || 
          url.startsWith('media/') ||
          url.startsWith('files/')) {
        console.info('[INFO] URL appears to be a file key already', JSON.stringify({ url }));
        return url;
      }
      
      console.error('[ERROR] Failed to extract file key from URL', 
        error instanceof Error ? error.stack : error, 
        JSON.stringify({ url }));
      return null;
    }
  }
}

export const s3Service = new S3Service();
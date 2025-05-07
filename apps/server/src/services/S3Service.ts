import { S3Client, PutObjectCommand, DeleteObjectCommand, ListBucketsCommand, GetObjectCommand, type S3ClientConfig } from '@aws-sdk/client-s3';
// Remove the s3-request-presigner import as we're not using it anymore
import AWS from 'aws-sdk'; // Import AWS SDK for the getSignedUrlPromise method
import crypto from 'crypto';
import { env } from '../env';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '@ampedbio/constants';

export type FileCategory = 'profiles' | 'backgrounds' | 'media' | 'files';
export type S3Operation = 'getObject' | 'putObject' | 'deleteObject';

class S3Service {
  private s3Client: S3Client; // For newer AWS SDK operations
  private s3: AWS.S3; // For signed URL generation using the v2 API
  private bucketName: string;
  private bucketRegion: string;
  private publicBaseUrl: string;

  constructor() {
    // Ensure region is trimmed and correctly formatted
    this.bucketRegion = env.AWS_REGION.trim();
    this.bucketName = env.AWS_S3_BUCKET_NAME.trim();
    
    // Debug credentials (partially masked for security)
    const accessKeyLastChars = env.AWS_ACCESS_KEY_ID.slice(-4);
    const secretKeyLastChars = env.AWS_SECRET_ACCESS_KEY.slice(-4);
    
    // Enhanced logging for debugging credential issues
    console.info('[INFO] S3Service initializing with credentials', 
      JSON.stringify({
        accessKeyId: `***${accessKeyLastChars}`,
        secretKeyId: `***${secretKeyLastChars}`,
        region: this.bucketRegion,
        bucketName: this.bucketName,
        regionLength: env.AWS_REGION.length,
        accessKeyLength: env.AWS_ACCESS_KEY_ID.length,
        secretKeyLength: env.AWS_SECRET_ACCESS_KEY.length,
        bucketNameLength: env.AWS_S3_BUCKET_NAME.length,
        hasEndpoint: Boolean(env.AWS_S3_ENDPOINT),
        endpointLength: env.AWS_S3_ENDPOINT?.length || 0
      })
    );
    
    // Log if any credentials appear to be missing or malformed
    if (!env.AWS_REGION || env.AWS_REGION.length < 2) {
      console.error('[ERROR] AWS_REGION is missing or invalid');
    }
    if (!env.AWS_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID.length < 16) {
      console.error('[ERROR] AWS_ACCESS_KEY_ID is missing or invalid');
    }
    if (!env.AWS_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY.length < 16) {
      console.error('[ERROR] AWS_SECRET_ACCESS_KEY is missing or invalid');
    }
    
    const clientOptions: S3ClientConfig = {
      region: this.bucketRegion,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID.trim(),
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim(),
      }
    };

    // Set the standard S3 public URL format based on the region
    this.publicBaseUrl = `https://${this.bucketName}.s3.${this.bucketRegion}.amazonaws.com`;

    // Add custom endpoint if provided (for local development with S3Mock or other S3-compatible services)
    if (env.AWS_S3_ENDPOINT && env.AWS_S3_ENDPOINT.trim().length > 0) {
      // Configure the API endpoint for the client
      clientOptions.endpoint = env.AWS_S3_ENDPOINT.trim();
      clientOptions.forcePathStyle = true; // Required for S3-compatible services
      
      // For local development with custom endpoints, adjust the public URL format accordingly
      // but keep the bucket name in the path
      this.publicBaseUrl = `${env.AWS_S3_ENDPOINT.trim()}/${this.bucketName}`;
    }
    
    // Initialize both S3 client types
    this.s3Client = new S3Client(clientOptions);
    
    // Initialize AWS SDK v2 S3 client for signed URL generation
    AWS.config.update({
      region: this.bucketRegion,
      accessKeyId: env.AWS_ACCESS_KEY_ID.trim(),
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim(),
    });
    
    if (env.AWS_S3_ENDPOINT && env.AWS_S3_ENDPOINT.trim().length > 0) {
      this.s3 = new AWS.S3({
        endpoint: env.AWS_S3_ENDPOINT.trim(),
        s3ForcePathStyle: true
      });
    } else {
      this.s3 = new AWS.S3();
    }

    console.info('[INFO] S3Service initialized', JSON.stringify({ 
      bucketName: this.bucketName, 
      region: this.bucketRegion,
      publicBaseUrl: this.publicBaseUrl,
      customEndpoint: clientOptions.endpoint || 'default AWS',
      forcePathStyle: clientOptions.forcePathStyle || false
    }));
    
    // Immediately test the connection
    this.testConnection();
  }

  /**
   * Test the S3 connection by listing buckets
   * This validates that the credentials are correct
   */
  async testConnection(): Promise<void> {
    try {
      console.info('[INFO] Testing S3 connection...');
      const command = new ListBucketsCommand({});
      const response = await this.s3Client.send(command);
      
      const buckets = response.Buckets || [];
      const bucketNames = buckets.map(bucket => bucket.Name);
      
      console.info('[INFO] S3 credentials validated successfully!', JSON.stringify({
        bucketsFound: buckets.length,
        bucketNames: bucketNames.slice(0, 5), // Show first 5 buckets
        targetBucketFound: bucketNames.includes(this.bucketName)
      }));
      
      if (!bucketNames.includes(this.bucketName)) {
        console.warn('[WARN] Target bucket not found in accessible buckets. Check permissions or bucket name.');
      }
    } catch (error) {
      console.error('[ERROR] S3 credential validation failed! Your AWS keys are likely invalid.', 
        error instanceof Error ? error.message : error);
      
      // Don't throw - allow the service to initialize, but mark it as problematic
      console.error('[ERROR] S3Service initialized with invalid credentials - file operations will fail!');
    }
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
   * The file key should NOT include the bucket name - that's specified separately in S3 operations
   */
  generateUniqueFileKey(category: FileCategory, userId: number, fileExtension: string): string {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    
    // Use simple folder structure using just the category name
    // No bucket name needed in the file key - S3 handles that separately
    const fileKey = `${category}/${timestamp}-${randomString}-${userId}.${fileExtension}`;
    
    console.info('[INFO] Generated unique file key', JSON.stringify({ fileKey, category, userId }));
    return fileKey;
  }

  /**
   * Get a signed URL for any S3 operation (getObject, putObject, deleteObject)
   * @param key - Object path/key in the bucket
   * @param operation - S3 operation type
   * @param expiresIn - URL expiration time in seconds (default: 300)
   * @returns Promise<string> - Signed URL
   */
  async getSignedUrl(key: string, operation: S3Operation, expiresIn: number = 300): Promise<string> {
    try {
      console.debug('[DEBUG] Creating signed URL for operation:', JSON.stringify({
        operation,
        bucket: this.bucketName,
        key,
        expiresIn
      }));

      const url = await this.s3.getSignedUrlPromise(operation, {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn
      });

      console.info('[INFO] Generated signed URL for operation', JSON.stringify({
        operation,
        key,
        expiresIn,
        urlLength: url.length,
        url,
      }));

      return url;
    } catch (error) {
      console.error('[ERROR] Failed to generate signed URL', 
        error instanceof Error ? error.stack : error,
        JSON.stringify({ operation, key }));
      throw error;
    }
  }

  /**
   * Get a pre-signed URL for client-side file upload
   * This URL comes directly from S3 and is used ONLY for uploading files
   */
  async getPresignedUploadUrl(
    category: FileCategory,
    userId: number, 
    contentType: string, 
    fileExtension: string
  ): Promise<{
    presignedUrl: string;  // Temporary URL for upload only
    fileKey: string;       // File identifier to be stored in the database
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
      
      // Get a signed URL for putting an object
      const presignedUrl = await this.getSignedUrl(fileKey, 'putObject', 300);

      return {
        presignedUrl,  // This URL is for upload only and is temporary
        fileKey,       // Store this key in the database to reference the file
      };
    } catch (error) {
      console.error('[ERROR] Error generating presigned URL', 
        error instanceof Error ? error.stack : error, 
        JSON.stringify({ category, userId, contentType }));
      throw error;
    }
  }

  /**
   * Get a pre-signed URL for downloading a file
   */
  async getPresignedDownloadUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    return this.getSignedUrl(fileKey, 'getObject', expiresIn);
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
   * This URL is for public access to the file after it has been uploaded
   */
  getFileUrl(fileKey: string): string {
    // Handle case where publicBaseUrl might already have a trailing slash
    const baseUrl = this.publicBaseUrl.endsWith('/') 
      ? this.publicBaseUrl.slice(0, -1) 
      : this.publicBaseUrl;
      
    const url = `${baseUrl}/${fileKey}`;
    console.info('[INFO] Generated public file URL for access/listing', JSON.stringify({ fileKey, url }));
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
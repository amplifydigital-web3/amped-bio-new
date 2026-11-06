import {
  S3Client,
  DeleteObjectCommand,
  ListBucketsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { env } from "../env";
import {
  ALLOWED_AVATAR_FILE_TYPES,
  ALLOWED_BACKGROUND_FILE_TYPES,
  ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES,
  ALLOWED_POOL_IMAGE,
} from "@repo/constants";
import { createPresignedPutUrl, verifyUploadedObject, type UploadVerification } from "./s3Upload";

const BYTES_PER_MB = 1024 * 1024;

export type FileCategory = "profiles" | "backgrounds" | "category" | "pool-images";
export type S3Operation = "getObject" | "putObject" | "deleteObject";

export interface GenerateFileKeyParams {
  category: FileCategory;
  userId: number;
  fileExtension: string;
  themeId?: number;
}

export interface IsThemeOwnerFileParams {
  fileKey: string;
  themeId: number;
  userId: number;
}

export interface GetTempFileUrlParams {
  bucket: string;
  fileKey: string;
  expiresIn?: number; // Optional expiration time in seconds, defaults to 3600 (1 hour)
}

export interface FileExistsParams {
  fileKey: string;
  bucket?: string; // Optional bucket, defaults to the default bucket
}

export interface VerifyUploadParams {
  fileKey: string;
  bucket?: string; // Optional bucket, defaults to the default bucket
  expectedSize: number | bigint | null; // Size declared when the upload URL was issued
  declaredType: string | null; // Content type declared when the upload URL was issued
  allowedTypes: readonly string[]; // Types the upload flow accepts
}

export interface GenerateServerFileKeyParams {
  category: FileCategory | "collection";
  fileExtension: string;
  collectionId?: number;
  themeId?: number;
  isThumbnail?: boolean;
}

class S3Service {
  private s3Client: S3Client;
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
    console.info(
      "[INFO] S3Service initializing with credentials",
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
        endpointLength: env.AWS_S3_ENDPOINT?.length || 0,
      })
    );

    // Log if any credentials appear to be missing or malformed
    if (!env.AWS_REGION || env.AWS_REGION.length < 2) {
      console.error("[ERROR] AWS_REGION is missing or invalid");
    }
    if (!env.AWS_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID.length < 16) {
      console.error("[ERROR] AWS_ACCESS_KEY_ID is missing or invalid");
    }
    if (!env.AWS_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY.length < 16) {
      console.error("[ERROR] AWS_SECRET_ACCESS_KEY is missing or invalid");
    }

    const clientOptions: S3ClientConfig = {
      region: this.bucketRegion,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID.trim(),
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim(),
      },
      ...S3Service.checksumOptions,
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

    // One AWS SDK v3 client for every operation, including presigning.
    this.s3Client = new S3Client(clientOptions);

    console.info(
      "[INFO] S3Service initialized",
      JSON.stringify({
        bucketName: this.bucketName,
        region: this.bucketRegion,
        publicBaseUrl: this.publicBaseUrl,
        customEndpoint: clientOptions.endpoint || "default AWS",
        forcePathStyle: clientOptions.forcePathStyle || false,
      })
    );

    // Immediately test the connection
    this.testConnection();
  }

  /**
   * AWS SDK v3 (3.729 and later) adds a CRC32 checksum to every request by
   * default. On a presigned PUT that checksum is computed over an empty body
   * and placed in the URL, so S3 rejects the real file a browser sends.
   * "WHEN_REQUIRED" turns that off for operations that do not need it. It also
   * keeps us compatible with S3 compatible stores (MinIO, Cloudflare R2).
   */
  private static readonly checksumOptions: Pick<
    S3ClientConfig,
    "requestChecksumCalculation" | "responseChecksumValidation"
  > = {
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };

  /**
   * Create an S3Client with the current configuration
   * This method ensures consistent client configuration across different operations
   * @returns S3Client - Configured S3 client instance
   */
  private createS3Client(): S3Client {
    const clientOptions: S3ClientConfig = {
      region: this.bucketRegion,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
      ...S3Service.checksumOptions,
    };

    // Add custom endpoint if provided (for local development with S3Mock or other S3-compatible services)
    if (env.AWS_S3_ENDPOINT && env.AWS_S3_ENDPOINT.length > 0) {
      clientOptions.endpoint = env.AWS_S3_ENDPOINT;
      clientOptions.forcePathStyle = true;
    }

    return new S3Client(clientOptions);
  }

  /**
   * Test the S3 connection by listing buckets
   * This validates that the credentials are correct
   */
  async testConnection(): Promise<void> {
    try {
      console.info("[INFO] Testing S3 connection...");
      const command = new ListBucketsCommand({});
      const response = await this.s3Client.send(command);

      const buckets = response.Buckets || [];
      const bucketNames = buckets.map(bucket => bucket.Name);

      console.info(
        "[INFO] S3 credentials validated successfully!",
        JSON.stringify({
          bucketsFound: buckets.length,
          bucketNames: bucketNames.slice(0, 5), // Show first 5 buckets
          targetBucketFound: bucketNames.includes(this.bucketName),
        })
      );

      if (!bucketNames.includes(this.bucketName)) {
        console.warn(
          "[WARN] Target bucket not found in accessible buckets. Check permissions or bucket name."
        );
      }
    } catch (error) {
      console.error(
        "[ERROR] S3 credential validation failed! Your AWS keys are likely invalid.",
        error instanceof Error ? error.message : error
      );

      // Don't throw - allow the service to initialize, but mark it as problematic
      console.error(
        "[ERROR] S3Service initialized with invalid credentials - file operations will fail!"
      );
    }
  }

  /**
   * Validate file type and size based on the file category.
   * fileSize is in bytes. The UPLOAD_LIMIT_*_MB env values are in MB.
   */
  validateFile(
    contentType: string,
    category: FileCategory,
    fileSize?: number
  ): { valid: boolean; message?: string } {
    // Get allowed file types and size limit based on category
    let allowedTypes: string[];
    let maxSizeMB: number;

    // Set validation rules based on file category
    if (category === "profiles") {
      allowedTypes = ALLOWED_AVATAR_FILE_TYPES;
      maxSizeMB = env.UPLOAD_LIMIT_PROFILE_PHOTO_MB;
    } else if (category === "backgrounds") {
      allowedTypes = ALLOWED_BACKGROUND_FILE_TYPES;
      maxSizeMB = env.UPLOAD_LIMIT_BACKGROUND_MB;
    } else if (category === "pool-images") {
      allowedTypes = ALLOWED_POOL_IMAGE;
      maxSizeMB = env.UPLOAD_LIMIT_POOL_IMAGE_MB;
    } else if (category === "category") {
      // Theme collection images (admin). Same rules as the admin router.
      allowedTypes = ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES;
      maxSizeMB = env.UPLOAD_LIMIT_COLLECTION_THUMBNAIL_MB;
    } else {
      // Invalid category
      return {
        valid: false,
        message: `Invalid file category: ${category}. Allowed categories are 'profiles', 'backgrounds', 'pool-images' and 'category'.`,
      };
    }
    const maxSize = maxSizeMB * BYTES_PER_MB;

    // Check file type
    if (!allowedTypes.includes(contentType)) {
      console.info(
        "[INFO] File validation failed: Invalid file type",
        JSON.stringify({
          category,
          contentType,
          allowedTypes,
        })
      );
      return {
        valid: false,
        message: `Invalid file type for ${category}. Allowed types: ${allowedTypes.join(", ")}`,
      };
    }

    // Check file size if provided
    if (fileSize !== undefined && (!Number.isSafeInteger(fileSize) || fileSize <= 0)) {
      return { valid: false, message: "File size must be a positive whole number of bytes" };
    }
    if (fileSize !== undefined && fileSize > maxSize) {
      console.info(
        "[INFO] File validation failed: File size exceeds limit",
        JSON.stringify({
          category,
          fileSize,
          maxSize,
        })
      );
      return {
        valid: false,
        message: `File size exceeds the maximum allowed size of ${maxSizeMB}MB for ${category}`,
      };
    }

    return { valid: true };
  }

  /**
   * Generate a unique file key for an uploaded file
   * The file key should NOT include the bucket name - that's specified separately in S3 operations
   */
  generateUniqueFileKey({
    category,
    userId,
    fileExtension,
    themeId,
  }: GenerateFileKeyParams): string {
    // Validate required parameters for backgrounds
    if (category === "backgrounds" && (themeId == null || themeId <= 0)) {
      throw new Error("themeId is required for backgrounds category");
    }

    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString("hex");

    let fileKey: string;

    if (category === "backgrounds" && themeId) {
      // For theme background uploads, store in user-uploads directory with theme ID in the file key
      fileKey = `user-uploads/backgrounds/theme_${themeId}_${timestamp}-${randomString}-${userId}.${fileExtension}`;
    } else {
      // For other file categories, use the standard format
      fileKey = `${category}/${timestamp}-${randomString}-${userId}.${fileExtension}`;
    }

    console.info(
      "[INFO] Generated unique file key",
      JSON.stringify({ fileKey, category, userId, themeId })
    );
    return fileKey;
  }

  /**
   * Generate a unique file key for server/admin uploaded files
   * These files are stored in the "server-uploads" directory and don't belong to specific users
   */
  generateServerFileKey({
    category,
    fileExtension,
    collectionId,
    themeId,
    isThumbnail = false,
  }: GenerateServerFileKeyParams): string {
    // Validate required parameters for specific categories
    if (category === "collection" && !collectionId) {
      throw new Error("collectionId is required for collection uploads");
    }
    if (category === "backgrounds" && (themeId == null || themeId <= 0)) {
      throw new Error("themeId is required for backgrounds category");
    }

    // Only background files can have thumbnails
    if (isThumbnail && category !== "backgrounds") {
      throw new Error("Thumbnails are only allowed for background files");
    }

    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString("hex");

    // Add thumbnail suffix if it's a thumbnail
    const thumbnailSuffix = isThumbnail ? "_thumbnail" : "";

    let fileKey: string;

    if (category === "collection" && collectionId) {
      // For theme collection image uploads
      fileKey = `server-uploads/collections/collection_${collectionId}_${timestamp}-${randomString}${thumbnailSuffix}.${fileExtension}`;
    } else if (category === "backgrounds" && themeId) {
      // For admin theme background uploads
      fileKey = `server-uploads/backgrounds/theme_${themeId}_${timestamp}-${randomString}${thumbnailSuffix}.${fileExtension}`;
    } else {
      // For other server file categories
      fileKey = `server-uploads/${category}/${timestamp}-${randomString}${thumbnailSuffix}.${fileExtension}`;
    }

    console.info(
      "[INFO] Generated server file key",
      JSON.stringify({ fileKey, category, collectionId, themeId, isThumbnail })
    );
    return fileKey;
  }

  /**
   * Get a signed URL for an S3 operation, on AWS SDK v3.
   * @param key - Object path/key in the bucket
   * @param operation - getObject or deleteObject. Uploads use getSignedUploadUrl,
   *   which needs the declared size.
   * @param expiresIn - URL expiration time in seconds (default: 300)
   * @returns Promise<string> - Signed URL
   */
  async getSignedUrl(
    key: string,
    operation: Exclude<S3Operation, "putObject">,
    expiresIn: number = 300
  ): Promise<string> {
    try {
      const command =
        operation === "getObject"
          ? new GetObjectCommand({ Bucket: this.bucketName, Key: key })
          : new DeleteObjectCommand({ Bucket: this.bucketName, Key: key });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      console.info(
        "[INFO] Generated signed URL for operation",
        JSON.stringify({ operation, key, expiresIn, urlLength: url.length })
      );
      return url;
    } catch (error) {
      console.error(
        "[ERROR] Failed to generate signed URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ operation, key })
      );
      throw error;
    }
  }

  /**
   * Get a presigned PUT URL bound to the declared type and size.
   * Content-Type and Content-Length are part of the signature, so S3 rejects
   * the request (403 SignatureDoesNotMatch) if the browser sends another type
   * or a body of another size. Browsers set Content-Length from the File.
   */
  async getSignedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn: number = 300
  ): Promise<string> {
    try {
      const url = await createPresignedPutUrl(this.s3Client, {
        bucket: this.bucketName,
        key,
        contentType,
        contentLength,
        expiresIn,
      });

      console.info(
        "[INFO] Generated signed upload URL",
        JSON.stringify({ key, contentType, contentLength, expiresIn, urlLength: url.length })
      );
      return url;
    } catch (error) {
      console.error(
        "[ERROR] Failed to generate signed upload URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ key, contentType, contentLength })
      );
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
    fileExtension: string,
    fileSize: number,
    themeId?: number
  ): Promise<{
    presignedUrl: string; // Temporary URL for upload only
    fileKey: string; // File identifier to be stored in the database
  }> {
    try {
      // Validate file type and declared size based on category
      const validation = this.validateFile(contentType, category, fileSize);
      if (!validation.valid) {
        console.error(
          "[ERROR] Failed to generate presigned URL",
          validation.message,
          JSON.stringify({
            category,
            userId,
            contentType,
            themeId,
          })
        );
        throw new Error(validation.message);
      }

      const fileKey = this.generateUniqueFileKey({ category, userId, fileExtension, themeId });

      // Signed PUT bound to the declared type and size
      const presignedUrl = await this.getSignedUploadUrl(fileKey, contentType, fileSize, 300);

      return {
        presignedUrl, // This URL is for upload only and is temporary
        fileKey, // Store this key in the database to reference the file
      };
    } catch (error) {
      console.error(
        "[ERROR] Error generating presigned URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ category, userId, contentType, fileSize, themeId })
      );
      throw error;
    }
  }

  /**
   * Get a pre-signed URL for downloading a file
   */
  async getPresignedDownloadUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    return this.getSignedUrl(fileKey, "getObject", expiresIn);
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
      console.info("[INFO] File deleted successfully", JSON.stringify({ fileKey }));
    } catch (error) {
      console.error(
        "[ERROR] Error deleting file",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ fileKey })
      );
      throw error;
    }
  }

  /**
   * Get the full public URL for a file
   * This URL is for public access to the file after it has been uploaded
   */
  getFileUrl(fileKey: string): string {
    // Handle case where publicBaseUrl might already have a trailing slash
    const baseUrl = this.publicBaseUrl.endsWith("/")
      ? this.publicBaseUrl.slice(0, -1)
      : this.publicBaseUrl;

    const url = `${baseUrl}/${fileKey}`;
    console.info(
      "[INFO] Generated public file URL for access/listing",
      JSON.stringify({ fileKey, url })
    );
    return url;
  }

  /**
   * Extract file key from a full S3 URL
   */
  extractFileKeyFromUrl(url: string): string | null {
    if (!url) {
      console.info("[INFO] Cannot extract file key from empty URL");
      return null;
    }

    try {
      // Try to extract the key from a full S3 URL
      const urlObject = new URL(url);
      const pathParts = urlObject.pathname.split("/");
      // Remove the first empty string (from leading slash)
      pathParts.shift();

      const fileKey = pathParts.join("/");

      console.info("[INFO] Extracted file key from URL", JSON.stringify({ url, fileKey }));
      return fileKey;
    } catch (error) {
      // If it's not a valid URL, it might already be just a key
      if (
        url.startsWith("profiles/") ||
        url.startsWith("backgrounds/") ||
        url.startsWith("user-uploads/backgrounds/") ||
        url.startsWith("media/") ||
        url.startsWith("files/")
      ) {
        console.info("[INFO] URL appears to be a file key already", JSON.stringify({ url }));
        return url;
      }

      console.error(
        "[ERROR] Failed to extract file key from URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ url })
      );
      return null;
    }
  }

  /**
   * Check if a file key belongs to a specific theme and user
   * This is used to determine if we should delete the old background when a new one is uploaded
   * @param params - Object containing fileKey, themeId, and userId
   * @returns boolean - True if the file key belongs to the specified theme and user
   */
  isThemeOwnerFile(params: IsThemeOwnerFileParams): boolean {
    const { fileKey, themeId, userId } = params;

    if (!fileKey) return false;

    // Check if it's a background category file (either in the old or new location)
    // Handle cases where fileKey might include bucket name as prefix
    if (
      !fileKey.includes("/backgrounds/") &&
      !fileKey.includes("/user-uploads/backgrounds/") &&
      !fileKey.startsWith("backgrounds/") &&
      !fileKey.startsWith("user-uploads/backgrounds/")
    )
      return false;

    // Check if it contains both the theme ID and user ID
    const hasThemeId = fileKey.includes(`theme_${themeId}_`);
    const hasUserId = fileKey.includes(`-${userId}.`);

    const result = hasThemeId && hasUserId;

    console.info(
      "[INFO] Checking if file belongs to theme and user",
      JSON.stringify({
        fileKey,
        themeId,
        userId,
        hasThemeId,
        hasUserId,
        result,
      })
    );

    return result;
  }

  /**
   * Check if a file exists in S3 bucket
   * @param params - Object containing fileKey and optional bucket
   * @returns Promise<boolean> - True if file exists, false otherwise
   */
  async fileExists(params: FileExistsParams): Promise<boolean> {
    const { fileKey, bucket } = params;
    const targetBucket = bucket || this.bucketName;

    try {
      console.info(
        "[INFO] Checking file existence",
        JSON.stringify({ fileKey, bucket: targetBucket })
      );

      // Use the existing s3Client if checking default bucket, otherwise create a new one
      const s3Client = bucket ? this.createS3Client() : this.s3Client;

      const headObjectCommand = new HeadObjectCommand({
        Bucket: targetBucket,
        Key: fileKey,
      });

      await s3Client.send(headObjectCommand);
      console.info("[INFO] File exists in S3", JSON.stringify({ fileKey, bucket: targetBucket }));
      return true;
    } catch (error: any) {
      // If the error is NotFound (404), the file doesn't exist
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        console.info(
          "[INFO] File does not exist in S3",
          JSON.stringify({ fileKey, bucket: targetBucket })
        );
        return false;
      }

      // For other errors, log and re-throw
      console.error(
        "[ERROR] Error checking file existence in S3",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ fileKey, bucket: targetBucket })
      );
      throw error;
    }
  }

  /**
   * Verify an uploaded object before it is marked COMPLETED.
   * Checks that it exists, that its stored size equals the size declared when
   * the upload URL was issued, and that its first 4 KB are an allowed type
   * matching the declared type. Does not delete anything; see
   * services/uploadVerification.ts for what the confirm routes do on failure.
   */
  async verifyUpload(params: VerifyUploadParams): Promise<UploadVerification> {
    const { fileKey, bucket, expectedSize, declaredType, allowedTypes } = params;
    const targetBucket = bucket || this.bucketName;
    const s3Client = bucket && bucket !== this.bucketName ? this.createS3Client() : this.s3Client;

    const result = await verifyUploadedObject(s3Client, {
      bucket: targetBucket,
      key: fileKey,
      expectedSize,
      declaredType,
      allowedTypes,
    });

    console.info(
      "[INFO] Upload verification",
      JSON.stringify({
        fileKey,
        bucket: targetBucket,
        ok: result.ok,
        ...(result.ok
          ? { size: result.size, detectedType: result.detectedType }
          : { reason: result.reason, detail: result.detail }),
      })
    );
    return result;
  }

  /**
   * Generate a temporary URL for accessing a file in any S3 bucket
   * This function allows access to files in different buckets, not just the default one
   * @param params - Object containing bucket name, file key, and optional expiration time
   * @returns Promise<string> - Temporary URL for accessing the file
   */
  async getTempFileUrl(params: GetTempFileUrlParams): Promise<string> {
    const { bucket, fileKey, expiresIn = 3600 } = params;

    try {
      console.info(
        "[INFO] Generating temporary file URL",
        JSON.stringify({
          bucket,
          fileKey,
          expiresIn,
        })
      );

      // Use the reusable S3Client creation method
      const s3Client = this.createS3Client();

      // Create the GetObjectCommand for the specific bucket and file
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      });

      // Generate the signed URL using AWS SDK v3
      const tempUrl = await getSignedUrl(s3Client, getObjectCommand, {
        expiresIn,
      });

      console.info(
        "[INFO] Generated temporary file URL successfully",
        JSON.stringify({
          bucket,
          fileKey,
          expiresIn,
          urlLength: tempUrl.length,
          url: tempUrl.substring(0, 100) + "...", // Log partial URL for security
        })
      );

      return tempUrl;
    } catch (error) {
      console.error(
        "[ERROR] Failed to generate temporary file URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ bucket, fileKey, expiresIn })
      );
      throw error;
    }
  }

  /**
   * Get a pre-signed URL for server/admin file upload
   * This URL is used for uploading files that belong to the server (like category images, admin themes, etc.)
   */
  async getServerPresignedUploadUrl(
    category: FileCategory,
    contentType: string,
    fileExtension: string,
    fileSize: number,
    collectionId?: number,
    themeId?: number,
    isThumbnail?: boolean
  ): Promise<{
    presignedUrl: string; // Temporary URL for upload only
    fileKey: string; // File identifier to be stored in the database
  }> {
    try {
      // Validate file type and declared size based on category.
      // "category" (collection images) has its own rules in validateFile.
      const validation = this.validateFile(contentType, category, fileSize);
      if (!validation.valid) {
        throw new Error(validation.message || "File validation failed");
      }

      const fileKey = this.generateServerFileKey({
        category,
        fileExtension,
        collectionId,
        themeId,
        isThumbnail,
      });

      // Signed PUT bound to the declared type and size
      const presignedUrl = await this.getSignedUploadUrl(fileKey, contentType, fileSize, 300);

      return {
        presignedUrl,
        fileKey,
      };
    } catch (error) {
      console.error(
        "[ERROR] Error generating server presigned URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ category, contentType, fileSize, collectionId, themeId, isThumbnail })
      );
      throw error;
    }
  }
}

export const s3Service = new S3Service();

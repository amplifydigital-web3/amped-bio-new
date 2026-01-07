import { S3Client, type S3FilePresignOptions } from "bun";
import crypto from "crypto";
import { env } from "../env";
import {
  ALLOWED_AVATAR_FILE_TYPES,
  ALLOWED_BACKGROUND_FILE_TYPES,
  ALLOWED_POOL_IMAGE,
} from "@ampedbio/constants";

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

export interface GenerateServerFileKeyParams {
  category: FileCategory | "collection";
  fileExtension: string;
  collectionId?: number;
  themeId?: number;
  isThumbnail?: boolean;
}

class S3Service {
  private bucketName: string;
  private bucketRegion: string;
  private publicBaseUrl: string;
  private s3: S3Client;
  private s3Config: {
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
    endpoint?: string;
  };

  constructor() {
    this.bucketRegion = env.AWS_REGION.trim();
    this.bucketName = env.AWS_S3_BUCKET_NAME.trim();

    const accessKeyLastChars = env.AWS_ACCESS_KEY_ID.slice(-4);
    const secretKeyLastChars = env.AWS_SECRET_ACCESS_KEY.slice(-4);

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

    if (!env.AWS_REGION || env.AWS_REGION.length < 2) {
      console.error("[ERROR] AWS_REGION is missing or invalid");
    }
    if (!env.AWS_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID.length < 16) {
      console.error("[ERROR] AWS_ACCESS_KEY_ID is missing or invalid");
    }
    if (!env.AWS_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY.length < 16) {
      console.error("[ERROR] AWS_SECRET_ACCESS_KEY is missing or invalid");
    }

    this.publicBaseUrl = `https://${this.bucketName}.s3.${this.bucketRegion}.amazonaws.com`;

    this.s3Config = {
      accessKeyId: env.AWS_ACCESS_KEY_ID.trim(),
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim(),
      bucket: this.bucketName,
      region: this.bucketRegion,
    };

    if (env.AWS_S3_ENDPOINT && env.AWS_S3_ENDPOINT.trim().length > 0) {
      const endpoint = env.AWS_S3_ENDPOINT.trim();
      this.s3Config.endpoint = endpoint;
      this.publicBaseUrl = `${endpoint}/${this.bucketName}`;
    }

    this.s3 = new S3Client(this.s3Config);

    console.info(
      "[INFO] S3Service initialized",
      JSON.stringify({
        bucketName: this.bucketName,
        region: this.bucketRegion,
        publicBaseUrl: this.publicBaseUrl,
        customEndpoint: this.s3Config.endpoint || "default AWS",
      })
    );

    this.testConnection();
  }

  async testConnection(): Promise<void> {
    try {
      console.info("[INFO] Testing S3 connection...");
      await this.s3.list();

      console.info(
        "[INFO] S3 credentials validated successfully!",
        JSON.stringify({
          bucketName: this.bucketName,
          region: this.bucketRegion,
        })
      );
    } catch (error) {
      console.error(
        "[ERROR] S3 credential validation failed! Your AWS keys are likely invalid.",
        error instanceof Error ? error.message : error
      );
      console.error(
        "[ERROR] S3Service initialized with invalid credentials - file operations will fail!"
      );
    }
  }

  /**
   * Validate file type and size based on the file category
   */
  validateFile(
    contentType: string,
    category: FileCategory,
    fileSize?: number
  ): { valid: boolean; message?: string } {
    // Get allowed file types and size limit based on category
    let allowedTypes: string[];
    let maxSize: number;

    // Set validation rules based on file category
    if (category === "profiles") {
      allowedTypes = ALLOWED_AVATAR_FILE_TYPES;
      maxSize = env.UPLOAD_LIMIT_PROFILE_PHOTO_MB;
    } else if (category === "backgrounds") {
      allowedTypes = ALLOWED_BACKGROUND_FILE_TYPES;
      maxSize = env.UPLOAD_LIMIT_BACKGROUND_MB;
    } else if (category === "pool-images") {
      allowedTypes = ALLOWED_POOL_IMAGE;
      maxSize = env.UPLOAD_LIMIT_POOL_IMAGE_MB;
    } else {
      // Invalid category
      return {
        valid: false,
        message: `Invalid file category: ${category}. Allowed categories are 'profiles', 'backgrounds', and 'pool-images'.`,
      };
    }

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
    if (fileSize !== undefined && fileSize > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
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
    if (category === "backgrounds" && !themeId) {
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
    if (category === "backgrounds" && !themeId) {
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

  async getSignedUrl(
    key: string,
    operation: S3Operation,
    expiresIn: number = 300,
    contentType?: string
  ): Promise<string> {
    try {
      console.debug(
        "[DEBUG] Creating signed URL for operation:",
        JSON.stringify({
          operation,
          bucket: this.bucketName,
          key,
          expiresIn,
          contentType,
        })
      );

      const method =
        operation === "putObject" ? "PUT" : operation === "deleteObject" ? "DELETE" : "GET";
      const options: S3FilePresignOptions = { expiresIn, method };

      if (contentType) {
        options.type = contentType;
      }

      const url = this.s3.presign(key, options);

      console.info(
        "[INFO] Generated signed URL for operation",
        JSON.stringify({
          operation,
          key,
          expiresIn,
          contentType,
          urlLength: url.length,
          url: url.substring(0, 100) + "...",
        })
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
   * Get a pre-signed URL for client-side file upload
   * This URL comes directly from S3 and is used ONLY for uploading files
   */
  async getPresignedUploadUrl(
    category: FileCategory,
    userId: number,
    contentType: string,
    fileExtension: string,
    themeId?: number
  ): Promise<{
    presignedUrl: string; // Temporary URL for upload only
    fileKey: string; // File identifier to be stored in the database
  }> {
    try {
      // Validate file type based on category
      const validation = this.validateFile(contentType, category);
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

      // Get a signed URL for putting an object
      const presignedUrl = await this.getSignedUrl(fileKey, "putObject", 300, contentType);

      return {
        presignedUrl, // This URL is for upload only and is temporary
        fileKey, // Store this key in the database to reference the file
      };
    } catch (error) {
      console.error(
        "[ERROR] Error generating presigned URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ category, userId, contentType, themeId })
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

  async deleteFile(fileKey: string): Promise<void> {
    try {
      await this.s3.delete(fileKey);
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

  async fileExists(params: FileExistsParams): Promise<boolean> {
    const { fileKey, bucket } = params;
    const targetBucket = bucket || this.bucketName;

    try {
      console.info(
        "[INFO] Checking file existence",
        JSON.stringify({ fileKey, bucket: targetBucket })
      );

      const exists = await this.s3.exists(fileKey);
      console.info(
        "[INFO] File exists in S3",
        JSON.stringify({ fileKey, bucket: targetBucket, exists })
      );
      return exists;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        console.info(
          "[INFO] File does not exist in S3",
          JSON.stringify({ fileKey, bucket: targetBucket })
        );
        return false;
      }

      console.error(
        "[ERROR] Error checking file existence in S3",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ fileKey, bucket: targetBucket })
      );
      throw error;
    }
  }

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

      const tempUrl = this.s3.presign(fileKey, { expiresIn });

      console.info(
        "[INFO] Generated temporary file URL successfully",
        JSON.stringify({
          bucket,
          fileKey,
          expiresIn,
          urlLength: tempUrl.length,
          url: tempUrl.substring(0, 100) + "...",
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
    collectionId?: number,
    themeId?: number,
    isThumbnail?: boolean
  ): Promise<{
    presignedUrl: string; // Temporary URL for upload only
    fileKey: string; // File identifier to be stored in the database
  }> {
    try {
      // Validate file type based on category
      const fileCategory: FileCategory = category === "category" ? "profiles" : category;
      const validation = this.validateFile(contentType, fileCategory);
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

      // Get a signed URL for putting an object
      const presignedUrl = await this.getSignedUrl(fileKey, "putObject", 300, contentType);

      return {
        presignedUrl,
        fileKey,
      };
    } catch (error) {
      console.error(
        "[ERROR] Error generating server presigned URL",
        error instanceof Error ? error.stack : error,
        JSON.stringify({ category, contentType, collectionId, themeId, isThumbnail })
      );
      throw error;
    }
  }
}

export const s3Service = new S3Service();

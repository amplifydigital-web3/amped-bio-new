import { FileStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface CreateUploadedFileParams {
  s3Key: string;
  bucket: string;
  fileName: string;
  fileType?: string;
  size?: number;
  userId?: number | null; // Nullable for admin/server files
}

export interface UpdateFileStatusParams {
  id: number;
  status: FileStatus;
}

export interface GetFileByKeyParams {
  s3Key: string;
  userId?: number; // Optional user filter
}

class UploadedFileService {
  /**
   * Create a new uploaded file record
   */
  async createUploadedFile(params: CreateUploadedFileParams) {
    const { s3Key, bucket, fileName, fileType, size, userId } = params;

    return await prisma.uploadedFile.create({
      data: {
        s3_key: s3Key,
        bucket,
        file_name: fileName,
        file_type: fileType,
        size: size ? BigInt(size) : null,
        user_id: userId,
        status: FileStatus.PENDING,
      },
    });
  }

  /**
   * Update file status after successful upload
   */
  async updateFileStatus(params: UpdateFileStatusParams) {
    const { id, status } = params;

    return await prisma.uploadedFile.update({
      where: { id },
      data: {
        status,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Get file by S3 key
   */
  async getFileByKey(params: GetFileByKeyParams) {
    const { s3Key, userId } = params;

    const where: any = { s3_key: s3Key };
    if (userId !== undefined) {
      where.user_id = userId;
    }

    return await prisma.uploadedFile.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Get file by ID
   */
  async getFileById(id: number) {
    return await prisma.uploadedFile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Delete file record (soft delete by updating status)
   */
  async deleteFile(id: number) {
    return await prisma.uploadedFile.update({
      where: { id },
      data: {
        status: FileStatus.DELETED,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Get user files
   */
  async getUserFiles(userId: number, status?: FileStatus) {
    const where: any = { user_id: userId };
    if (status) {
      where.status = status;
    }

    return await prisma.uploadedFile.findMany({
      where,
      orderBy: {
        created_at: "desc",
      },
    });
  }

  /**
   * Get admin/server files (files with null user_id)
   */
  async getServerFiles(status?: FileStatus) {
    const where: any = { user_id: null };
    if (status) {
      where.status = status;
    }

    return await prisma.uploadedFile.findMany({
      where,
      orderBy: {
        created_at: "desc",
      },
    });
  }

  /**
   * Check if file belongs to user or is a server file
   */
  async canUserAccessFile(fileId: number, userId?: number): Promise<boolean> {
    const file = await this.getFileById(fileId);
    if (!file) return false;

    // If file has no user_id, it's a server file (accessible to admins)
    if (file.user_id === null) {
      return true; // You might want to add admin role check here
    }

    // If user is provided, check if they own the file
    return file.user_id === userId;
  }

  /**
   * Get URL for file based on whether it's a legacy URL or new file reference
   */
  async getFileUrlFromReference(imageField: string | null, imageFileId: number | null): Promise<string | null> {
    // If we have a file ID, use the new system
    if (imageFileId) {
      const file = await this.getFileById(imageFileId);
      if (file && file.status === "COMPLETED") {
        // We'll need to import s3Service here or pass it as a parameter
        // For now, we'll return the s3_key and let the caller construct the URL
        return file.s3_key;
      }
      return null;
    }

    // If we have a legacy URL, return it directly
    if (imageField) {
      return imageField;
    }

    return null;
  }

  /**
   * Migrate legacy URL to new file system
   * This can be called to gradually migrate existing URLs to the new system
   */
  async migrateLegacyUrl(legacyUrl: string, userId?: number): Promise<number | null> {
    try {
      // Extract S3 key from legacy URL
      const urlParts = legacyUrl.split('/');
      const s3Key = urlParts.slice(-1)[0] || urlParts.slice(-2).join('/');
      
      if (!s3Key) return null;

      // Check if file already exists in our system
      const existingFile = await this.getFileByKey({ s3Key });
      if (existingFile) {
        return existingFile.id;
      }

      // Create new file record for legacy file
      const newFile = await this.createUploadedFile({
        s3Key,
        bucket: process.env.AWS_S3_BUCKET_NAME || "default-bucket",
        fileName: s3Key.split('/').pop() || s3Key,
        fileType: legacyUrl.includes('.jpg') || legacyUrl.includes('.jpeg') ? 'image/jpeg' : 
                 legacyUrl.includes('.png') ? 'image/png' : 
                 legacyUrl.includes('.gif') ? 'image/gif' : 'unknown',
        userId,
      });

      // Mark as completed since it's already uploaded
      await this.updateFileStatus({
        id: newFile.id,
        status: "COMPLETED",
      });

      return newFile.id;
    } catch (error) {
      console.error("Error migrating legacy URL:", error);
      return null;
    }
  }
}

export const uploadedFileService = new UploadedFileService();

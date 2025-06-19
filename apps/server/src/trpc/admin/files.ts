import { adminProcedure, router } from "../trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { uploadedFileService } from "../../services/UploadedFileService";
import { s3Service } from "../../services/S3Service";
import { 
  PaginationSchema, 
  FileFilterSchema, 
  FileActionSchema 
} from "./schemas";

const prisma = new PrismaClient();

export const filesRouter = router({
  getFiles: adminProcedure
    .input(z.object({
      ...PaginationSchema.shape,
      ...FileFilterSchema.shape
    }))
    .query(async ({ input }) => {
      const { page, limit, search, status, fileType, userId } = input;
      const skip = (page - 1) * limit;
      
      // Build filter conditions
      const where: any = {};
      
      if (search) {
        where.OR = [
          { file_name: { contains: search } },
          { s3_key: { contains: search } },
          { user: { name: { contains: search } } }
        ];
      }
      
      if (status) {
        where.status = status;
      }
      
      if (userId !== undefined) {
        where.user_id = userId;
      }
      
      // File type filtering based on MIME type
      if (fileType) {
        switch (fileType) {
          case "image":
            where.file_type = { startsWith: "image/" };
            break;
          case "video":
            where.file_type = { startsWith: "video/" };
            break;
          case "document":
            where.file_type = { 
              in: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
            };
            break;
          case "other":
            where.file_type = { 
              not: { 
                OR: [
                  { startsWith: "image/" },
                  { startsWith: "video/" },
                  { in: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] }
                ]
              }
            };
            break;
        }
      }
      
      try {
        // Get files with pagination
        const files = await prisma.uploadedFile.findMany({
          skip,
          take: limit,
          where,
          orderBy: { uploaded_at: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        });
        
        // Get total count for pagination
        const totalFiles = await prisma.uploadedFile.count({ where });
        
        // Transform files to include resolved URLs and user names
        const transformedFiles = files.map(file => ({
          id: file.id,
          s3_key: file.s3_key,
          bucket: file.bucket,
          file_name: file.file_name,
          file_type: file.file_type,
          size: file.size ? Number(file.size) : 0,
          user_id: file.user_id,
          uploaded_at: file.uploaded_at.toISOString(),
          status: file.status,
          userName: file.user ? file.user.name : "System",
          preview_url: file.file_type?.startsWith("image/") || file.file_type?.startsWith("video/") 
            ? s3Service.getFileUrl(file.s3_key) 
            : null
        }));
        
        return {
          files: transformedFiles,
          pagination: {
            total: totalFiles,
            pages: Math.ceil(totalFiles / limit),
            page,
            limit
          }
        };
      } catch (error) {
        console.error('Failed to fetch files:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch files'
        });
      }
    }),
    
  getFileDetails: adminProcedure
    .input(FileActionSchema)
    .query(async ({ input }) => {
      const { fileId } = input;
      
      try {
        const file = await prisma.uploadedFile.findUnique({
          where: { id: fileId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                onelink: true,
              }
            }
          }
        });
        
        if (!file) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'File not found'
          });
        }
        
        return {
          id: file.id,
          s3_key: file.s3_key,
          bucket: file.bucket,
          file_name: file.file_name,
          file_type: file.file_type,
          size: file.size ? Number(file.size) : 0,
          user_id: file.user_id,
          uploaded_at: file.uploaded_at.toISOString(),
          created_at: file.created_at.toISOString(),
          updated_at: file.updated_at?.toISOString(),
          status: file.status,
          user: file.user ? {
            id: file.user.id,
            name: file.user.name,
            email: file.user.email,
            onelink: file.user.onelink
          } : null,
          url: s3Service.getFileUrl(file.s3_key),
          preview_url: file.file_type?.startsWith("image/") || file.file_type?.startsWith("video/") 
            ? s3Service.getFileUrl(file.s3_key) 
            : null
        };
      } catch (error) {
        console.error('Failed to fetch file details:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch file details'
        });
      }
    }),
    
  getFileDownloadUrl: adminProcedure
    .input(FileActionSchema)
    .query(async ({ input }) => {
      const { fileId } = input;
      
      try {
        const file = await uploadedFileService.getFileById(fileId);
        
        if (!file) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'File not found'
          });
        }
        
        // Generate a signed URL for downloading
        const downloadUrl = s3Service.getFileUrl(file.s3_key);
        
        return {
          downloadUrl,
          fileName: file.file_name,
          fileSize: file.size ? Number(file.size) : 0,
          fileType: file.file_type
        };
      } catch (error) {
        console.error('Failed to generate download URL:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate download URL'
        });
      }
    }),
    
  getFilePreviewUrl: adminProcedure
    .input(FileActionSchema)
    .query(async ({ input }) => {
      const { fileId } = input;
      
      try {
        const file = await uploadedFileService.getFileById(fileId);
        
        if (!file) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'File not found'
          });
        }
        
        // Only generate preview URLs for images and videos
        if (!file.file_type?.startsWith("image/") && !file.file_type?.startsWith("video/")) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Preview not available for this file type'
          });
        }
        
        const previewUrl = s3Service.getFileUrl(file.s3_key);
        
        return {
          previewUrl,
          fileName: file.file_name,
          fileType: file.file_type
        };
      } catch (error) {
        console.error('Failed to generate preview URL:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate preview URL'
        });
      }
    }),
    
  deleteFile: adminProcedure
    .input(FileActionSchema)
    .mutation(async ({ input }) => {
      const { fileId } = input;
      
      try {
        const file = await uploadedFileService.getFileById(fileId);
        
        if (!file) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'File not found'
          });
        }
        
        // Check if file is still being used by any entity
        const fileUsages = await prisma.$transaction(async (tx) => {
          const [userProfiles, themeCategories, themes, themesWithBackgrounds] = await Promise.all([
            // Check if file is used as user profile image
            tx.user.findMany({
              where: { image_file_id: fileId },
              select: { id: true, name: true, email: true }
            }),
            
            // Check if file is used as theme category image
            tx.themeCategory.findMany({
              where: { image_file_id: fileId },
              select: { id: true, name: true, title: true }
            }),
            
            // Check if file is used as theme thumbnail
            tx.theme.findMany({
              where: { thumbnail_file_id: fileId },
              select: { id: true, name: true, user: { select: { name: true, email: true } } }
            }),
            
            // Check if file is used as theme background (in config JSON)
            tx.theme.findMany({
              where: {
                config: {
                  path: "$.background.fileId",
                  equals: fileId
                }
              },
              select: { id: true, name: true, user: { select: { name: true, email: true } } }
            })
          ]);
          
          return { userProfiles, themeCategories, themes, themesWithBackgrounds };
        });
        
        // If file is still being used, throw an error with details
        const usageDetails = [];
        
        if (fileUsages.userProfiles.length > 0) {
          const users = fileUsages.userProfiles.map(u => `${u.name} (${u.email})`).join(', ');
          usageDetails.push(`User profile images: ${users}`);
        }
        
        if (fileUsages.themeCategories.length > 0) {
          const categories = fileUsages.themeCategories.map(c => c.title || c.name).join(', ');
          usageDetails.push(`Theme category images: ${categories}`);
        }
        
        if (fileUsages.themes.length > 0) {
          const themes = fileUsages.themes.map(t => {
            const themeName = t.name || `Theme #${t.id}`;
            const userName = t.user?.name ? ` (by ${t.user.name})` : '';
            return `${themeName}${userName}`;
          }).join(', ');
          usageDetails.push(`Theme thumbnails: ${themes}`);
        }
        
        if (fileUsages.themesWithBackgrounds.length > 0) {
          const themes = fileUsages.themesWithBackgrounds.map(t => {
            const themeName = t.name || `Theme #${t.id}`;
            const userName = t.user?.name ? ` (by ${t.user.name})` : '';
            return `${themeName}${userName}`;
          }).join(', ');
          usageDetails.push(`Theme backgrounds: ${themes}`);
        }
        
        if (usageDetails.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cannot delete file "${file.file_name}" because it is still being used by: ${usageDetails.join('; ')}. Please remove these references first before deleting the file.`
          });
        }
        
        // Mark file as deleted in database
        await uploadedFileService.deleteFile(fileId);
        
        // Delete from S3
        try {
          await s3Service.deleteFile(file.s3_key);
        } catch (s3Error) {
          console.warn(`Failed to delete file from S3: ${s3Error}`);
          // Continue anyway since the database record is marked as deleted
        }
        
        return {
          success: true,
          message: `File "${file.file_name}" has been successfully deleted`,
          deletedFile: {
            id: file.id,
            name: file.file_name,
            s3_key: file.s3_key
          }
        };
      } catch (error) {
        console.error('Failed to delete file:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete file'
        });
      }
    }),
});

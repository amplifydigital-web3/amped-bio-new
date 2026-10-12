import { trpcClient, type RouterOutputs } from "@repo/ui";
import {
  ALLOWED_BACKGROUND_FILE_EXTENSIONS,
  ALLOWED_BACKGROUND_FILE_TYPES,
  ALLOWED_COLLECTION_THUMBNAIL_FILE_EXTENSIONS,
  ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES,
} from "@repo/constants";

// Theme and collection media uploads (Screen Review 088). Each upload asks
// the server for a presigned URL, puts the file, then confirms it.

export type UploadLimits = RouterOutputs["admin"]["upload"]["getLimits"];

const MB = 1024 * 1024;
const extensionOf = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";

async function put(url: string, file: File) {
  const response = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
}

export async function uploadThemeThumbnail(themeId: number, file: File) {
  const presigned = await trpcClient.admin.upload.requestThemeThumbnailPresignedUrl.mutate({
    themeId,
    contentType: file.type,
    fileExtension: extensionOf(file),
    fileSize: file.size,
  });
  await put(presigned.presignedUrl, file);
  await trpcClient.admin.upload.confirmThemeThumbnailUpload.mutate({
    themeId,
    fileId: presigned.fileId,
    fileName: file.name,
  });
}

export async function uploadThemeBackground(themeId: number, file: File) {
  const presigned = await trpcClient.admin.upload.requestAdminThemeBackgroundUrl.mutate({
    themeId,
    contentType: file.type,
    fileExtension: extensionOf(file),
    fileSize: file.size,
  });
  await put(presigned.presignedUrl, file);
  await trpcClient.admin.upload.confirmAdminThemeBackgroundUpload.mutate({
    themeId,
    fileId: presigned.fileId,
    fileName: file.name,
    mediaType: file.type.startsWith("video/") ? "video" : "image",
  });
}

export async function uploadCollectionImage(collectionId: number, file: File) {
  const presigned = await trpcClient.admin.upload.requestThemeCollectionImagePresignedUrl.mutate({
    collectionId,
    contentType: file.type,
    fileExtension: extensionOf(file),
    fileSize: file.size,
  });
  await put(presigned.presignedUrl, file);
  await trpcClient.admin.upload.confirmThemeCollectionImageUpload.mutate({
    collectionId,
    fileId: presigned.fileId,
    fileName: file.name,
  });
}

/** Thumbnails and collection images: JPG, PNG or WebP within the admin limit. */
export function validateImageFile(file: File, limits?: UploadLimits): string | undefined {
  const allowed = ALLOWED_COLLECTION_THUMBNAIL_FILE_EXTENSIONS.join(", ").toUpperCase();
  if (
    !ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES.includes(file.type) ||
    !ALLOWED_COLLECTION_THUMBNAIL_FILE_EXTENSIONS.includes(extensionOf(file))
  ) {
    return `Use a ${allowed} image.`;
  }
  const max = limits?.maxCollectionThumbnailFileSize || 50 * MB;
  if (file.size > max) return `Use an image up to ${Math.round(max / MB)} MB.`;
  return undefined;
}

export function imageLimitsLine(limits?: UploadLimits): string {
  const allowed = ALLOWED_COLLECTION_THUMBNAIL_FILE_EXTENSIONS.map(e => e.toUpperCase()).join(", ");
  const max = limits?.maxCollectionThumbnailFileSize;
  return max ? `${allowed}, up to ${Math.round(max / MB)} MB.` : `${allowed}.`;
}

/** Backgrounds: the allowed image and video types within the admin limit. */
export function validateBackgroundFile(file: File, limits?: UploadLimits): string | undefined {
  if (
    !ALLOWED_BACKGROUND_FILE_TYPES.includes(file.type) ||
    !ALLOWED_BACKGROUND_FILE_EXTENSIONS.includes(extensionOf(file))
  ) {
    return `Use one of these types: ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(", ").toUpperCase()}.`;
  }
  const max = limits?.maxAdminBackgroundFileSize || 50 * MB;
  if (file.size > max) return `Use a file up to ${Math.round(max / MB)} MB.`;
  return undefined;
}

export function backgroundLimitsLine(limits?: UploadLimits): string {
  const allowed = ALLOWED_BACKGROUND_FILE_EXTENSIONS.map(e => e.toUpperCase()).join(", ");
  const max = limits?.maxAdminBackgroundFileSize;
  return max ? `${allowed}, up to ${Math.round(max / MB)} MB.` : `${allowed}.`;
}

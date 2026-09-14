// File management types
export type FileStatus = "PENDING" | "COMPLETED" | "DELETED";
export type FileType = "image" | "video" | "document" | "other";

export interface FileData {
  id: number;
  s3_key: string;
  bucket: string;
  file_name: string;
  file_type: string | null;
  size: number;
  user_id: number | null;
  uploaded_at: string;
  status: FileStatus;
  userName: string;
  preview_url?: string | null; // Optional preview URL for images/videos
}

export interface FileFilters {
  searchTerm: string;
  statusFilter: FileStatus | "ALL";
  typeFilter: FileType | "ALL";
}

export interface FileActions {
  onPreview: (file: FileData) => void;
  onDownload: (file: FileData) => void;
  onDelete: (file: FileData) => void;
}

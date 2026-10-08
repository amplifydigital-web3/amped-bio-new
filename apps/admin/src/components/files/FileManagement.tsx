import { useEffect, useState } from "react";
import {
  Download,
  Eye,
  File as FileIcon,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MoreHorizontal,
  SearchX,
  Trash2,
  Video,
} from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  trpc,
} from "@repo/ui";
import type { FileData, FileStatus, FileType } from "../shared/fileTypes";
import { ConfirmDialog, FilterChips, SearchWell, retryToast } from "../../kit/parts";
import {
  SlabPager,
  SlabSkeletonRows,
  rowClass,
  stickyCell,
  tdClass,
  thClass,
} from "../../kit/Slab";
import { WordBadge } from "../../kit/WordBadge";
import { formatBytes, formatCount, formatDay } from "../../kit/format";

// Screen Review 088 I10 to I14. Files: always visible filters (search well,
// Status chips, Type chips) over a G2 slab table with rows 55, word badges,
// 44 Preview and Download, Delete in an overflow behind a destructive confirm,
// the shared loading, error and empty states, and the slab footer pager.

const COLUMNS = 6;
type StatusChip = FileStatus | "ALL";
type TypeChip = FileType | "ALL";

const STATUS_BADGE: Record<FileStatus, { tone: "success" | "warning" | "ink"; label: string }> = {
  COMPLETED: { tone: "success", label: "Completed" },
  PENDING: { tone: "warning", label: "Pending" },
  DELETED: { tone: "ink", label: "Deleted" },
};

/** Keeps the start and the extension: maya-lin-cove…-tide.jpg */
function middleTruncate(name: string, max = 42) {
  if (name.length <= max) return name;
  const keep = max - 1;
  return `${name.slice(0, Math.ceil(keep * 0.6))}…${name.slice(-Math.floor(keep * 0.4))}`;
}

function typeLabel(file: FileData) {
  const extension = file.file_name.split(".").pop();
  if (extension && extension !== file.file_name && extension.length <= 10) {
    return extension === "ampedtheme" ? "Theme file" : extension.toUpperCase();
  }
  return file.file_type?.split("/")[1]?.toUpperCase() ?? "File";
}

function TypeIcon({ type }: { type: string | null }) {
  const Icon = type?.startsWith("image/")
    ? ImageIcon
    : type?.startsWith("video/")
      ? Video
      : type?.includes("pdf") || type?.startsWith("text/")
        ? FileText
        : FileIcon;
  return <Icon aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" strokeWidth={1.5} />;
}

/** 34 thumbnail r8, or the type icon in a 34 block when there is none or it fails. */
function FileThumb({ file }: { file: FileData }) {
  const [failed, setFailed] = useState(false);
  const previewable = file.file_type?.startsWith("image/") && file.preview_url;
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-prism-8 bg-white/70 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]">
      {previewable && !failed ? (
        <img
          src={file.preview_url!}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <TypeIcon type={file.file_type} />
      )}
    </span>
  );
}

function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const iconButton =
  "prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint";

export function FileManagement() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<StatusChip>("ALL");
  const [type, setType] = useState<TypeChip>("ALL");
  const [deleting, setDeleting] = useState<FileData | null>(null);
  const debounced = useDebounced(search.trim());
  // Runs from 2 characters while typing, or on Enter (088 I10)
  const term = submitted || (debounced.length >= 2 ? debounced : "");

  useEffect(() => {
    if (search.trim() !== submitted) setSubmitted("");
  }, [search, submitted]);
  useEffect(() => setPage(1), [term, status, type, pageSize]);

  const files = useQuery({
    ...trpc.admin.files.getFiles.queryOptions({
      page,
      limit: pageSize,
      search: term || undefined,
      status: status === "ALL" ? undefined : status,
      fileType: type === "ALL" ? undefined : type,
    }),
    placeholderData: keepPreviousData,
  });

  const deleteFile = useMutation({
    ...trpc.admin.files.deleteFile.mutationOptions(),
    onSuccess: () => {
      toast.success(`${deleting?.file_name ?? "File"} deleted`);
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: trpc.admin.files.getFiles.queryKey() });
    },
    onError: (_error, variables) => {
      setDeleting(null);
      retryToast("The file was not deleted", () => deleteFile.mutate(variables));
    },
  });

  const preview = async (file: FileData) => {
    // Open the tab during the click so the browser does not block it
    const tab = window.open("about:blank", "_blank");
    try {
      const data = await queryClient.fetchQuery(
        trpc.admin.files.getFilePreviewUrl.queryOptions({ fileId: file.id })
      );
      if (tab) {
        tab.opener = null;
        tab.location.href = data.previewUrl;
      } else {
        window.open(data.previewUrl, "_blank", "noopener");
      }
    } catch {
      tab?.close();
      retryToast(`The preview for ${file.file_name} did not open`, () => void preview(file));
    }
  };

  const download = async (file: FileData) => {
    try {
      const data = await queryClient.fetchQuery(
        trpc.admin.files.getFileDownloadUrl.queryOptions({ fileId: file.id })
      );
      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      retryToast(`${file.file_name} did not download`, () => void download(file));
    }
  };

  const list = (files.data?.files ?? []) as FileData[];
  const pagination = files.data?.pagination;
  const filtered = term !== "" || status !== "ALL" || type !== "ALL";
  const showAll = () => {
    setSearch("");
    setSubmitted("");
    setStatus("ALL");
    setType("ALL");
  };

  return (
    <div className="space-y-[13px] font-prism">
      <div className="flex flex-wrap items-end gap-3">
        <SearchWell
          label="Search files"
          placeholder="Name, path or owner"
          value={search}
          onChange={setSearch}
          onSubmit={() => setSubmitted(search.trim())}
          className="w-full md:w-[508px]"
        />
        <p className="pb-3 text-prism-meta tabular-nums text-prism-ink-2">
          {pagination ? `${formatCount(pagination.total)} files` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <FilterChips
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "ALL", label: "All" },
            { value: "COMPLETED", label: "Completed" },
            { value: "PENDING", label: "Pending" },
            { value: "DELETED", label: "Deleted" },
          ]}
        />
        <FilterChips
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: "ALL", label: "All" },
            { value: "image", label: "Images" },
            { value: "video", label: "Videos" },
            { value: "document", label: "Documents" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>

      {files.isError && !files.data ? (
        <ErrorCard
          title="Files did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void files.refetch()}
        />
      ) : (
        <div className="prism-slab overflow-hidden">
          <div className="overflow-x-auto">
            <table aria-label="Files" className="w-full min-w-[900px] text-left">
              <thead>
                <tr>
                  <th scope="col" className={`${thClass} ${stickyCell}`}>
                    File
                  </th>
                  <th scope="col" className={thClass}>
                    Type and size
                  </th>
                  <th scope="col" className={thClass}>
                    Owner
                  </th>
                  <th scope="col" className={thClass}>
                    Status
                  </th>
                  <th scope="col" className={thClass}>
                    Uploaded
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Actions
                  </th>
                </tr>
              </thead>
              {files.isPending ? (
                <SlabSkeletonRows columns={COLUMNS} />
              ) : list.length === 0 ? (
                <tbody>
                  <tr className="border-t border-prism-line">
                    <td colSpan={COLUMNS}>
                      {filtered ? (
                        <EmptyState
                          icon={SearchX}
                          title="No files match these filters"
                          action={
                            <Button variant="ghost" onClick={showAll}>
                              Show all
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState
                          icon={FolderOpen}
                          title="No files yet"
                          description="Files people upload appear here."
                        />
                      )}
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {list.map(file => {
                    const badge = STATUS_BADGE[file.status];
                    const canPreview =
                      file.file_type?.startsWith("image/") || file.file_type?.startsWith("video/");
                    return (
                      <tr key={file.id} className={rowClass}>
                        <td className={`${tdClass} ${stickyCell}`}>
                          <div className="flex items-center gap-3">
                            <FileThumb file={file} />
                            <div className="min-w-0">
                              <p
                                title={file.file_name}
                                className="whitespace-nowrap text-prism-label font-semibold text-prism-ink"
                              >
                                {middleTruncate(file.file_name)}
                              </p>
                              <p
                                title={file.s3_key}
                                className="max-w-[377px] truncate text-prism-meta text-prism-ink-2"
                              >
                                {file.s3_key}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td
                          className={`${tdClass} whitespace-nowrap text-prism-meta tabular-nums text-prism-ink`}
                        >
                          {typeLabel(file)} · {formatBytes(file.size)}
                        </td>
                        <td className={`${tdClass} text-prism-label text-prism-ink`}>
                          {file.userName}
                        </td>
                        <td className={tdClass}>
                          <WordBadge tone={badge.tone}>{badge.label}</WordBadge>
                        </td>
                        <td
                          className={`${tdClass} whitespace-nowrap text-prism-meta tabular-nums text-prism-ink`}
                        >
                          {formatDay(file.uploaded_at)}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-right`}>
                          <span className="inline-flex items-center gap-1">
                            {canPreview ? (
                              <button
                                type="button"
                                aria-label={`Preview ${file.file_name} (opens in a new tab)`}
                                onClick={() => void preview(file)}
                                className={iconButton}
                              >
                                <Eye aria-hidden className="h-5 w-5" strokeWidth={1.5} />
                              </button>
                            ) : (
                              <span className="inline-block w-touch" />
                            )}
                            <button
                              type="button"
                              aria-label={`Download ${file.file_name}`}
                              onClick={() => void download(file)}
                              className={iconButton}
                            >
                              <Download aria-hidden className="h-5 w-5" strokeWidth={1.5} />
                            </button>
                            <Menu>
                              <MenuTrigger
                                aria-label={`More actions for ${file.file_name}`}
                                className={iconButton}
                              >
                                <MoreHorizontal aria-hidden className="h-5 w-5" />
                              </MenuTrigger>
                              <MenuContent align="end">
                                <MenuItem destructive onSelect={() => setDeleting(file)}>
                                  <Trash2 aria-hidden />
                                  Delete
                                </MenuItem>
                              </MenuContent>
                            </Menu>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
          {pagination && (
            <SlabPager
              page={page}
              pages={pagination.pages}
              total={pagination.total}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={setPageSize}
              noun="Files"
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={open => !open && setDeleting(null)}
        title={`Delete ${deleting?.file_name ?? "this file"}?`}
        body="This removes the file from storage and cannot be undone."
        confirmLabel="Delete file"
        destructive
        busy={deleteFile.isPending}
        onConfirm={() => deleting && deleteFile.mutate({ fileId: deleting.id })}
      />
    </div>
  );
}

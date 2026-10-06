import { useId, useRef, useState } from "react";
import { AlertCircle, ImageIcon, ImagePlus } from "lucide-react";
import { Button, trpcClient } from "@repo/ui";
import { ALLOWED_POOL_IMAGE } from "@repo/constants";
import { COPY, IMAGE_MAX_BYTES } from "./copy";

export interface PoolImage {
  fileId: number;
  preview: string;
}

type UploadError = "size" | "type" | "upload";

const ERRORS: Record<UploadError, string> = {
  size: "Image is larger than 5 MB. Choose a smaller file.",
  type: "Use a PNG or JPG image.",
  upload: "Upload did not finish. Retry.",
};

// PUT with progress events (fetch has no upload progress)
function putWithProgress(url: string, file: File, onProgress: (share: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`Upload failed with ${request.status}`));
    request.onerror = () => reject(new Error("Upload failed"));
    request.send(file);
  });
}

/**
 * Screen Review 065 I09: art tile with Upload image (Replace image once set)
 * and Remove. Type and size are checked before the presigned URL is
 * requested; a 3px bar shows progress; errors sit under the field.
 */
export function PoolImageField({
  value,
  onChange,
}: {
  value: PoolImage | null;
  onChange: (image: PoolImage | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const helperId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<UploadError | null>(null);
  const lastFile = useRef<File | null>(null);

  const upload = async (file: File) => {
    lastFile.current = file;
    setError(null);
    if (!ALLOWED_POOL_IMAGE.includes(file.type)) return setError("type");
    if (file.size > IMAGE_MAX_BYTES) return setError("size");
    setProgress(0);
    try {
      const { presignedUrl, fileId } =
        await trpcClient.pools.creator.requestPoolImagePresignedUrl.mutate({
          contentType: file.type,
          fileExtension: file.name.split(".").pop() || "",
          fileSize: file.size,
        });
      await putWithProgress(presignedUrl, file, setProgress);
      await trpcClient.pools.creator.confirmPoolImageUpload.mutate({
        fileId,
        fileName: file.name,
      });
      onChange({ fileId, preview: URL.createObjectURL(file) });
    } catch {
      setError("upload");
    } finally {
      setProgress(null);
    }
  };

  const uploading = progress !== null;

  return (
    <div className="space-y-2 font-prism">
      <p className="text-prism-label font-semibold text-prism-ink">Pool image (optional)</p>
      <div className="flex items-start gap-3">
        <div className="relative h-commit w-commit shrink-0 overflow-hidden rounded-prism-13 bg-[#EFE7F8]">
          {value ? (
            <img src={value.preview} alt="Pool image" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon aria-hidden className="h-[21px] w-[21px] text-prism-value-ink" />
            </div>
          )}
          {uploading && (
            <span
              role="progressbar"
              aria-label="Uploading image"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress ?? 0) * 100)}
              className="absolute inset-x-0 bottom-0 h-[3px] bg-white/60"
            >
              <span
                className="block h-full bg-prism-nav transition-[width] duration-prism-hover"
                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
              />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={uploading}
              aria-describedby={helperId}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus aria-hidden />
              {uploading ? "Uploading" : value ? "Replace image" : "Upload image"}
            </Button>
            {value && !uploading && (
              <Button type="button" variant="ghost" onClick={() => onChange(null)}>
                Remove
              </Button>
            )}
          </div>
          <p id={helperId} className="text-prism-meta text-prism-ink-2">
            {COPY.imageHelper}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_POOL_IMAGE.join(",")}
          className="hidden"
          tabIndex={-1}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 text-prism-meta text-prism-danger">
          <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
          <span className="flex-1">{ERRORS[error]}</span>
          {error === "upload" && lastFile.current && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => lastFile.current && void upload(lastFile.current)}
            >
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

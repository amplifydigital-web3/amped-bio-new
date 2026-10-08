import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button, cn, trpc } from "@repo/ui";
import { ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES } from "@repo/constants";
import { FieldError } from "../../kit/parts";
import { imageLimitsLine, validateImageFile } from "./uploads";

// Screen Review 088 I02. The thumbnail field: a 89 square well that shows the
// chosen image untouched (creator made content), Change and Remove, the
// allowed types and size from getLimits, and the field error under it.
export function ThemeThumbnailSelector({
  onFileSelect,
  onError,
  selectedFile,
  error,
  required = true,
  autoFocus = false,
}: {
  onFileSelect: (file: File | null) => void;
  onError?: (error: string) => void;
  selectedFile?: File | null;
  // Field error text, for example "Thumbnail is required."
  error?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wellRef = useRef<HTMLButtonElement>(null);
  const { data: limits } = useQuery(trpc.admin.upload.getLimits.queryOptions());

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (autoFocus) wellRef.current?.focus();
  }, [autoFocus]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateImageFile(file, limits);
    if (problem) {
      onError?.(problem);
      return;
    }
    onFileSelect(file);
  };

  return (
    <div className="space-y-2 font-prism">
      <p id={`${id}-label`} className="text-prism-label font-semibold text-prism-ink">
        Thumbnail
        {required && <span className="font-normal text-prism-ink-2"> (Required)</span>}
      </p>
      <div className="flex items-center gap-3">
        <button
          ref={wellRef}
          type="button"
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-note`}
          aria-invalid={error ? true : undefined}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "prism-well prism-focus flex h-[89px] w-[89px] shrink-0 items-center justify-center overflow-hidden !rounded-prism-13",
            error && "shadow-[inset_0_0_0_1.5px_#B3261E]"
          )}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Plus aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
          )}
          <span className="sr-only">
            {selectedFile ? "Change thumbnail" : "Choose a thumbnail"}
          </span>
        </button>
        {selectedFile && (
          <div className="min-w-0 space-y-1">
            <p className="truncate text-prism-meta text-prism-ink">{selectedFile.name}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => onFileSelect(null)}>
              Remove
            </Button>
          </div>
        )}
      </div>
      {error ? (
        <FieldError id={`${id}-note`}>{error}</FieldError>
      ) : (
        <p id={`${id}-note`} className="text-prism-meta text-prism-ink-2">
          {imageLimitsLine(limits)}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES.join(",")}
        onChange={onChange}
      />
    </div>
  );
}

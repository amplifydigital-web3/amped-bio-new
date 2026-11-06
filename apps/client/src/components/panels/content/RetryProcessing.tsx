import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Upload } from "lucide-react";
import { Button, trpcClient } from "@repo/ui";
import type { ContentUploadKind } from "@repo/constants";
import { CONTENT_COPY } from "./copy";
import { browserUploadDeps, contentUploadApi, normalizeApiError } from "./lib/browserDeps";
import { kindForFile, mimeForFile, readVideoDuration } from "./lib/files";
import { refreshContent } from "./lib/uploads";
import { messageForApiError, UploadTask, type UploadDeps } from "./lib/uploadTask";

const e = CONTENT_COPY.editor;

/**
 * Retry for a failed item (PR 6, spec 3.10). The server runs processing again
 * when it still holds the source (Stream keeps a video; an R2 upload is kept
 * when processing never started), at most once an hour. Otherwise it asks for
 * the file, and the file uploads into the same item, keeping its details, with
 * the same upload task the library uses.
 */
export function RetryProcessing({
  publicId,
  kind,
  onChange,
}: {
  publicId: string;
  kind: ContentUploadKind;
  onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const taskRef = useRef<UploadTask | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "needs_file" | "uploading" | "started">(
    "idle"
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Leaving the page stops sending; the item stays and can be retried again
  useEffect(() => () => taskRef.current?.pause(), []);

  const retry = async () => {
    setState("busy");
    setError(null);
    try {
      const result = await trpcClient.content.retryProcessing.mutate({ publicId });
      if (result.status === "needs_file") {
        setState("needs_file");
        return;
      }
      setState("started");
      refreshContent(publicId);
      onChange();
    } catch (failure) {
      setError(messageForApiError(normalizeApiError(failure)));
      setState("idle");
    }
  };

  const upload = async (file: File) => {
    setError(null);
    if (kindForFile(file.name) !== kind) {
      setError(e.retryWrongKind(CONTENT_COPY.kinds[kind] ?? kind));
      return;
    }
    const mimeType = mimeForFile(file, kind);
    const durationSec = kind === "video" ? await readVideoDuration(file) : undefined;
    // The same upload task as the library, pointed at this item instead of a new one
    const deps: UploadDeps = {
      ...browserUploadDeps,
      api: {
        ...contentUploadApi,
        createUpload: async input => {
          const result = await trpcClient.content.retryProcessing
            .mutate({
              publicId,
              file: {
                fileName: input.fileName,
                mimeType: input.mimeType,
                size: input.size,
                durationSec: input.durationSec,
              },
            })
            .catch(failure => {
              throw normalizeApiError(failure);
            });
          if (result.status !== "uploading") throw new Error(CONTENT_COPY.errors.generic);
          return { publicId: result.publicId, target: result.target };
        },
      },
    };
    setState("uploading");
    setProgress(0);
    const task = new UploadTask({ file, kind, mimeType, durationSec }, deps, () => {
      const snap = task.snapshot;
      setProgress(snap.total ? Math.round((snap.loaded / snap.total) * 100) : 0);
      if (snap.phase === "failed") {
        setError(snap.error ?? CONTENT_COPY.errors.generic);
        setState("needs_file");
      }
    });
    taskRef.current = task;
    await task.run();
    if (task.snapshot.phase === "processing") {
      setState("started");
      refreshContent(publicId);
      onChange();
    }
  };

  if (state === "started") {
    return (
      <p role="status" className="text-prism-meta font-semibold text-prism-ink">
        {e.retryStarted}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {state === "needs_file" || state === "uploading" ? (
        <>
          <p className="text-prism-meta text-prism-ink">{e.retryNeedsFile}</p>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            disabled={state === "uploading"}
            onClick={() => fileRef.current?.click()}
          >
            {state === "uploading" ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {state === "uploading" ? e.retryUploading(progress) : e.retryChoose}
          </Button>
        </>
      ) : (
        <Button variant="secondary" disabled={state === "busy"} onClick={() => void retry()}>
          {state === "busy" ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <RotateCcw className="h-4 w-4" aria-hidden />
          )}
          {state === "busy" ? e.retrying : e.retry}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-prism-meta font-semibold text-prism-danger">
          {error}
        </p>
      )}
    </div>
  );
}

import { useId, useRef, useState } from "react";
import { ExternalLink, Globe, Loader2, Trash2 } from "lucide-react";
import { Button, Notice, queryClient, trpc, trpcClient, useAuth } from "@repo/ui";
import { CONTENT_COPY } from "./copy";
import { EYEBROW_NAV } from "./lib/labels";
import { messageForApiError } from "./lib/uploadTask";
import { normalizeApiError } from "./lib/browserDeps";
import { refreshContent } from "./lib/uploads";
import { toast } from "@/components/ui/toast";

const e = CONTENT_COPY.editor;

export interface PublishItem {
  publicId: string;
  title: string;
  status: "uploading" | "processing" | "ready" | "failed" | "blocked" | "deleted";
  publishState: "draft" | "published" | "archived";
  moderationState: "pending" | "clear" | "held" | "blocked";
  adult: boolean;
}

/** The item's public link on the creator's site (spec 3.7). */
export function publicItemUrl(handle: string, publicId: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}/c/${publicId}`;
}

/**
 * Publishing and delete for one item (PR 6, spec 3.10 and 3.12). Publish puts a
 * finished, cleared item on the creator's public pages; Unpublish takes it off.
 * Delete removes it for 30 days, restorable from Recently removed; a failed
 * upload is removed at once.
 */
export function PublishCard({ item, onDeleted }: { item: PublishItem; onDeleted: () => void }) {
  const headingId = useId();
  const { authUser } = useAuth();
  const handle = authUser?.handle ?? "";
  const [busy, setBusy] = useState<"publish" | "unpublish" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef(false);

  const published = item.publishState === "published";
  const ready = item.status === "ready";
  const held = item.moderationState === "held";
  const blocked = item.status === "blocked" || item.moderationState === "blocked";
  const cleared = item.moderationState === "clear";
  // Only a ready, cleared, non 18+ item publishes: the server refuses the rest
  const canPublish = ready && cleared && !held && !blocked && !item.adult;
  const publishReason = blocked
    ? e.publishBlocked
    : held
      ? e.publishReview
      : !ready
        ? e.publishProcessing
        : item.adult
          ? e.publishAdult
          : e.publishNotClear;
  const key: readonly unknown[] = trpc.content.get.queryKey({ publicId: item.publicId });

  const run = async (action: "publish" | "unpublish") => {
    setBusy(action);
    setError(null);
    try {
      const updated =
        action === "publish"
          ? await trpcClient.content.publish.mutate({ publicId: item.publicId })
          : await trpcClient.content.unpublish.mutate({ publicId: item.publicId });
      queryClient.setQueryData<Record<string, unknown>>(key, old =>
        old ? { ...old, ...(updated as unknown as Record<string, unknown>) } : old
      );
      refreshContent();
    } catch (failure) {
      setError(messageForApiError(normalizeApiError(failure)));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      if (item.status === "failed") {
        await trpcClient.content.abortUpload.mutate({ publicId: item.publicId });
        toast.add({ type: "success", title: CONTENT_COPY.card.removed(item.title) });
      } else {
        await trpcClient.content.delete.mutate({ publicId: item.publicId });
        toast.add({ type: "success", title: e.deleted(item.title), description: e.deletedHelp });
      }
      refreshContent(item.publicId);
      onDeleted();
    } catch (failure) {
      setError(messageForApiError(normalizeApiError(failure)));
      setBusy(null);
    }
  };

  const canDelete =
    item.status === "ready" || item.status === "failed" || item.status === "blocked";

  return (
    <section
      aria-labelledby={headingId}
      className="prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]"
    >
      <p className={EYEBROW_NAV}>{e.publishEyebrow}</p>
      <h2 id={headingId} className="flex items-center gap-2 text-prism-panel-title text-prism-ink">
        {published && <Globe className="h-5 w-5 text-prism-nav" aria-hidden />}
        {published ? e.publishTitlePublic : e.publishTitleDraft}
      </h2>
      <p className="text-prism-meta text-prism-ink-2">
        {published ? e.publishPublicHelp : e.publishHelp}
      </p>

      {published && item.adult && (
        <Notice variant="warning" title={e.adult}>
          {e.publishAdult}
        </Notice>
      )}

      {published ? (
        <div className="flex flex-wrap gap-2">
          {handle && !item.adult && (
            <a
              href={publicItemUrl(handle, item.publicId)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={e.viewPublicLabel}
              className="prism-btn-secondary prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 px-4 text-prism-label font-semibold"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {e.viewPublic}
            </a>
          )}
          <Button
            variant="secondary"
            onClick={() => void run("unpublish")}
            disabled={busy !== null}
          >
            {busy === "unpublish" && (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {e.unpublish}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button onClick={() => void run("publish")} disabled={!canPublish || busy !== null}>
            {busy === "publish" && (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {busy === "publish" ? e.publishing : e.publish}
          </Button>
          {!canPublish && <p className="text-prism-meta text-prism-ink-2">{publishReason}</p>}
        </div>
      )}

      {error && (
        <Notice variant="error" title={busy === "delete" ? e.deleteFailed : e.publishFailed}>
          {error}
        </Notice>
      )}

      {canDelete && (
        <div className="border-t border-prism-line pt-[13px]">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (confirmRef.current) return;
              confirmRef.current = true;
              void remove().finally(() => (confirmRef.current = false));
            }}
            className="prism-focus -ml-2 inline-flex h-touch items-center gap-1 rounded-prism-8 px-2 text-prism-label font-semibold text-prism-danger hover:underline disabled:opacity-60"
          >
            {busy === "delete" ? (
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Trash2 className="h-5 w-5" aria-hidden />
            )}
            {busy === "delete" ? e.deleting : e.deleteItem}
          </button>
          {item.status === "ready" && (
            <p className="text-prism-meta text-prism-ink-2">{e.deleteHelp}</p>
          )}
        </div>
      )}
    </section>
  );
}

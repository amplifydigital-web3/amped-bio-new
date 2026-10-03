import { useEffect, useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ExternalLink, ImageIcon, Pencil } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  trpc,
  trpcClient,
} from "@repo/ui";
import { PoolImageField, type PoolImage } from "../create/PoolImageField";
import { DESCRIPTION_MAX } from "../create/copy";
import { poolPageUrl } from "./format";

export interface DashboardPool {
  id: number;
  name: string;
  address: string;
  chainId: string;
  description: string | null;
  image: { id: number; url: string } | null;
}

/**
 * Screen Review 067 I07: Change pool image in the shared Dialog with the row
 * 065 upload rules. A failed save shows inline here, not only in the console.
 */
function ChangeImageDialog({
  open,
  onOpenChange,
  poolId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poolId: number;
  onSaved: () => void;
}) {
  const [image, setImage] = useState<PoolImage | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  useEffect(() => {
    if (!open) {
      setImage(null);
      setState("idle");
    }
  }, [open]);

  const save = async (next: PoolImage) => {
    setState("saving");
    try {
      await trpcClient.pools.creator.setImageForPool.mutate({
        id: poolId,
        image_file_id: next.fileId,
      });
      onSaved();
      onOpenChange(false);
    } catch {
      setState("failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[508px]">
        <DialogHeader>
          <DialogTitle>Change pool image</DialogTitle>
          <DialogDescription>Fans see this image on your pool card and page.</DialogDescription>
        </DialogHeader>
        <PoolImageField
          value={image}
          onChange={next => {
            setImage(next);
            if (next) void save(next);
          }}
        />
        {state === "saving" && (
          <p role="status" className="text-prism-meta text-prism-ink-2">
            Saving
          </p>
        )}
        {state === "failed" && image && (
          <div role="alert" className="flex items-center gap-2 text-prism-meta text-prism-danger">
            <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
            <span className="flex-1">The new image did not save.</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => void save(image)}>
              Retry
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 067 I07, I08: the pool as fans see it, with Change image and View page. */
export function PoolCard({
  pool,
  creatorName,
  handle,
  avatar,
  fans,
  totalStaked,
  totalNote,
  onImageSaved,
}: {
  pool: DashboardPool;
  creatorName?: string;
  handle?: string;
  avatar?: string | null;
  fans: React.ReactNode;
  totalStaked: React.ReactNode;
  totalNote?: React.ReactNode;
  onImageSaved: () => void;
}) {
  const [imageOpen, setImageOpen] = useState(false);
  const firstLine = (pool.description ?? "").trim().split("\n")[0];
  const byline = [creatorName && `by ${creatorName}`, firstLine].filter(Boolean).join(" · ");

  return (
    <article className="prism-lens relative flex w-full flex-col gap-3 p-2 font-prism lg:max-w-[495px]">
      <span aria-hidden className="prism-rim" />
      <div className="relative h-[202px] overflow-hidden rounded-prism-13 bg-[#EFE7F8]">
        {pool.image?.url ? (
          <img src={pool.image.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon aria-hidden className="h-[34px] w-[34px] text-prism-value-ink" />
          </div>
        )}
        <button
          type="button"
          aria-label="Change pool image"
          onClick={() => setImageOpen(true)}
          className="prism-icon-btn prism-focus absolute right-2 top-2"
        >
          <ImageIcon aria-hidden className="h-[21px] w-[21px]" />
        </button>
        {handle && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <span className="h-[34px] w-[34px] overflow-hidden rounded-full bg-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]">
              {avatar && <img src={avatar} alt="" className="h-full w-full object-cover" />}
            </span>
            <span
              className={
                pool.image?.url
                  ? "text-prism-meta font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]"
                  : "text-prism-meta font-semibold text-prism-ink"
              }
            >
              @{handle}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-1 px-3">
        <h2 className="line-clamp-2 break-words text-prism-card-title text-prism-ink">
          {pool.name}
        </h2>
        {byline && (
          <p className="line-clamp-2 text-[16px] leading-[26px] text-prism-ink-2">{byline}</p>
        )}
      </div>
      <footer className="mx-3 mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-prism-line pb-2 pt-3">
        <dl className="flex flex-wrap gap-6">
          <div>
            <dt className="text-prism-meta text-prism-ink-2">Fans</dt>
            <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">{fans}</dd>
          </div>
          <div>
            <dt className="text-prism-meta text-prism-ink-2">Total staked</dt>
            <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
              {totalStaked}
            </dd>
            {totalNote && <dd className="text-prism-meta text-prism-ink-2">{totalNote}</dd>}
          </div>
        </dl>
        <Button asChild variant="secondary">
          <a href={poolPageUrl(pool.address)} target="_blank" rel="noopener noreferrer">
            View page
            <ExternalLink aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      </footer>
      <ChangeImageDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        poolId={pool.id}
        onSaved={onImageSaved}
      />
    </article>
  );
}

/** 067 I09: About with an inline description editor. */
export function AboutSection({ pool, onSaved }: { pool: DashboardPool; onSaved: () => void }) {
  const inputId = useId();
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pool.description ?? "");
  const [savedShown, setSavedShown] = useState(false);
  const mutation = useMutation({ ...trpc.pools.creator.updateDescription.mutationOptions() });

  useEffect(() => {
    if (!editing) setDraft(pool.description ?? "");
  }, [pool.description, editing]);

  useEffect(() => {
    if (!savedShown) return;
    const timer = setTimeout(() => setSavedShown(false), 3000);
    return () => clearTimeout(timer);
  }, [savedShown]);

  const trimmed = draft.trim();
  const unchanged = trimmed === (pool.description ?? "").trim();

  const save = () => {
    mutation.mutate(
      { chainId: pool.chainId, description: trimmed },
      {
        onSuccess: () => {
          setEditing(false);
          setSavedShown(true);
          onSaved();
        },
      }
    );
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 font-prism">
      <div className="flex min-h-touch items-center justify-between gap-3">
        <h2
          id={headingId}
          className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2"
        >
          <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
          About
        </h2>
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            className="prism-glass-clear"
            onClick={() => {
              mutation.reset();
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            Edit description
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <label htmlFor={inputId} className="sr-only">
            Pool description
          </label>
          <textarea
            id={inputId}
            autoFocus
            rows={3}
            maxLength={DESCRIPTION_MAX}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            className="prism-well prism-focus block min-h-[89px] w-full resize-none px-4 py-3 text-prism-body text-prism-ink focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={unchanged || !trimmed || mutation.isPending}
                onClick={save}
              >
                {mutation.isPending ? "Saving" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  mutation.reset();
                }}
              >
                Cancel
              </Button>
            </div>
            <span className="text-prism-meta tabular-nums text-prism-ink-2">
              {draft.length}/{DESCRIPTION_MAX}
            </span>
          </div>
          {mutation.isError && (
            <div
              role="alert"
              className="prism-slab flex min-h-touch items-center gap-2 !rounded-prism-13 py-1 pl-4 pr-1"
            >
              <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-danger" />
              <p className="flex-1 text-prism-meta text-prism-danger">
                Description did not save. Your text is still here.
              </p>
              <Button type="button" variant="ghost" onClick={save}>
                Retry
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="whitespace-pre-line break-words text-prism-body text-prism-ink">
            {pool.description}
          </p>
          {savedShown && (
            <p role="status" className="flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
              <CheckCircle2 aria-hidden className="h-[21px] w-[21px] text-prism-success" />
              Saved
            </p>
          )}
        </>
      )}
    </section>
  );
}

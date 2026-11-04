import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Lock } from "lucide-react";
import { cn, queryClient, trpc, trpcClient } from "@repo/ui";
import type { ContentAccessInput } from "@repo/constants";
import { AccessPicker } from "../../content/AccessPicker";
import { CONTENT_COPY } from "../../content/copy";

const e = CONTENT_COPY.editor;

/**
 * Who can open this, on a link, media or text block row (access gating G3).
 * The same picker as the item editor; it saves through blocks.setAccessRule.
 * Collapsed by default so the row's own fields stay first.
 */
export function BlockAccessFields({
  blockId,
  gated,
  onGatedChange,
}: {
  blockId: number;
  gated: boolean;
  onGatedChange: (gated: boolean) => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(gated);
  const query = useQuery({
    ...trpc.blocks.getAccess.queryOptions({ id: blockId }),
    enabled: open,
  });

  async function save(next: ContentAccessInput | null) {
    const result = await trpcClient.blocks.setAccessRule.mutate({ blockId, access: next });
    onGatedChange(result.gated);
    await queryClient.invalidateQueries({
      queryKey: trpc.blocks.getAccess.queryKey({ id: blockId }),
    });
  }

  return (
    <div className="mt-[21px] border-t border-prism-line pt-[13px]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="prism-focus flex min-h-touch w-full items-center gap-2 rounded-prism-13 text-left"
      >
        <Lock aria-hidden className="h-[18px] w-[18px] shrink-0 text-prism-ink-2" />
        <span className="flex-1 text-prism-label font-semibold text-prism-ink">
          {e.accessTitle}
        </span>
        <span className="text-prism-meta text-prism-ink-2">
          {gated ? CONTENT_COPY.editor.gate.locked : e.rules.everyone![0]}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("h-[18px] w-[18px] text-prism-ink-2", open && "rotate-180")}
        />
      </button>
      {open && (
        <div id={panelId} className="mt-2">
          {query.data ? (
            <AccessPicker
              inline
              access={query.data.access}
              gating={query.data.gating}
              onSave={save}
            />
          ) : (
            <p role="status" className="text-prism-meta text-prism-ink-2">
              {query.isError ? e.gate.saveFailed : e.saving}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

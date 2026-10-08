import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LayoutGrid, Plus } from "lucide-react";
import {
  DEFAULT_FOLLOW_CONFIG,
  DEFAULT_FOLLOWERS_CONFIG,
  SINGLETON_BLOCK_TYPES,
  type BlockType,
} from "@repo/constants";
import { Button, EmptyState, trpcClient } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { toast } from "@/components/ui/toast";
import { onAddBlockRequest } from "@/components/preview/addBlockRequest";
import { useOpenParam } from "@/hooks/useOpenParam";
import { AddBlockDialog, type NewBlockKind } from "./AddBlockDialog";
import { BlockRow } from "./BlockRow";
import { blockNeed, blockTitle } from "./blockInfo";

// Screen Review 034 to 037. The Blocks section of Page: eyebrow with Add
// block, then one list card of rows in the order visitors see them. Reorder,
// visibility and edits autosave (D11); delete is instant with Undo.

const UNDO_MS = 8000;
const DRAFT_ID = -1;

function draftFor(kind: NewBlockKind): BlockType {
  switch (kind.type) {
    case "media":
      return {
        id: DRAFT_ID,
        type: "media",
        order: 0,
        config: { platform: kind.platform, url: "", label: "" },
      };
    case "pool":
      return { id: DRAFT_ID, type: "pool", order: 0, config: { address: "", label: "" } };
    case "referral":
      return { id: DRAFT_ID, type: "referral", order: 0, config: {} };
    case "follow":
      return { id: DRAFT_ID, type: "follow", order: 0, config: { ...DEFAULT_FOLLOW_CONFIG } };
    case "followers":
      return {
        id: DRAFT_ID,
        type: "followers",
        order: 0,
        config: { ...DEFAULT_FOLLOWERS_CONFIG, show: { ...DEFAULT_FOLLOWERS_CONFIG.show } },
      };
    default:
      return { id: DRAFT_ID, type: "text", order: 0, config: { content: "", platform: "text" } };
  }
}

export function BlocksSection() {
  const { blocks, addBlock, updateBlock, reorderBlocks, selectedBlockId, selectBlock, profile } =
    useEditor();
  const [dialogOpen, setDialogOpen] = useState(false);
  // A new block stays in its draft row until it collapses, so typing keeps its
  // focus when the first valid value creates it on the server
  const [draft, setDraft] = useState<BlockType | null>(null);
  const [draftCreatedId, setDraftCreatedId] = useState<number | null>(null);
  const creating = useRef(false);
  const latestDraftConfig = useRef<BlockType["config"] | null>(null);
  const pendingDeletes = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Add block from the preview hint or the empty list (006 I09)
  useEffect(() => onAddBlockRequest(() => setDialogOpen(true)), []);
  // Home checklist step 3 opens the dialog on Link (015 I06)
  useOpenParam("add-block", () => setDialogOpen(true));

  // Pending deletes run when their Undo expires or when Page closes (036 I07)
  useEffect(() => {
    const pending = pendingDeletes.current;
    const runAll = () => {
      pending.forEach((timer, id) => {
        clearTimeout(timer);
        void trpcClient.blocks.deleteBlock.mutate({ id }).catch(() => undefined);
      });
      pending.clear();
    };
    // Unmount does not run when the tab closes. Ask before leaving while a delete
    // waits for its Undo, and send it on pagehide as a last resort; otherwise the
    // block stays on the server and comes back on the next load.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", runAll);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", runAll);
      runAll();
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 233, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const titleOf = (id: string | number) => {
    const block = blocks.find(b => String(b.id) === String(id));
    return block ? blockTitle(block) : "Block";
  };
  const positionOf = (id: string | number) =>
    blocks.findIndex(b => String(b.id) === String(id)) + 1;

  // 036 I04: spoken reorder feedback with block names
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)} of ${blocks.length}`,
    onDragOver: ({ active, over }) =>
      over
        ? `Moved ${titleOf(active.id)} to position ${positionOf(over.id)} of ${blocks.length}`
        : "",
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${titleOf(active.id)} at position ${positionOf(over.id)} of ${blocks.length}`
        : "",
    onDragCancel: ({ active }) =>
      `Reorder cancelled, ${titleOf(active.id)} returned to position ${positionOf(active.id)}`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex(b => String(b.id) === String(active.id));
    const to = blocks.findIndex(b => String(b.id) === String(over.id));
    if (from !== -1 && to !== -1) reorderBlocks(arrayMove(blocks, from, to));
  };

  const closeDraft = () => {
    latestDraftConfig.current = null;
    setDraft(null);
    setDraftCreatedId(null);
  };

  const open = (id: number | null) => {
    closeDraft();
    selectBlock(id);
  };

  const pick = (kind: NewBlockKind) => {
    if ((SINGLETON_BLOCK_TYPES as readonly string[]).includes(kind.type)) {
      // Referral has no fields and the follow blocks have defaults: add at
      // once and open the row (#30 acceptance 1: on the page within the add)
      const title = blockTitle(draftFor(kind));
      void addBlock(draftFor(kind))
        .then(block => selectBlock(block.id))
        .catch(() => toast.add({ type: "error", title: `${title} was not added.` }));
      return;
    }
    selectBlock(null);
    setDraftCreatedId(null);
    setDraft(draftFor(kind));
  };

  // 037 I14: a draft reaches the page from its first valid value
  const onDraftChange = async (config: BlockType["config"]) => {
    if (!draft) return;
    const next = { ...draft, config } as BlockType;
    setDraft(next);
    latestDraftConfig.current = config;
    if (draftCreatedId !== null) {
      updateBlock(draftCreatedId, config);
      return;
    }
    if (blockNeed(next) !== null || creating.current) return;
    creating.current = true;
    try {
      const created = await addBlock({ ...next, id: 0 } as BlockType);
      setDraftCreatedId(created.id);
      // Changes typed while the block was being created were skipped above;
      // apply the latest one so the last keystrokes are not lost
      if (latestDraftConfig.current && latestDraftConfig.current !== config) {
        updateBlock(created.id, latestDraftConfig.current);
      }
    } catch {
      toast.add({ type: "error", title: "The block was not added. Check your connection." });
    } finally {
      creating.current = false;
    }
  };

  const remove = (block: BlockType) => {
    const index = blocks.findIndex(b => b.id === block.id);
    const title = blockTitle(block);
    const without = blocks.filter(b => b.id !== block.id);
    if (selectedBlockId === block.id) selectBlock(null);
    reorderBlocks(without);

    const commit = async () => {
      pendingDeletes.current.delete(block.id);
      try {
        await trpcClient.blocks.deleteBlock.mutate({ id: block.id });
      } catch {
        restore();
        toast.add({
          type: "error",
          title: `${title} was not deleted.`,
          duration: Infinity,
          actionProps: { children: "Retry", onClick: () => remove(block) },
        });
      }
    };
    const restore = () => {
      const timer = pendingDeletes.current.get(block.id);
      if (timer) clearTimeout(timer);
      pendingDeletes.current.delete(block.id);
      const current = [...blocksRef.current.filter(b => b.id !== block.id)];
      current.splice(Math.min(index, current.length), 0, block);
      reorderBlocks(current);
    };

    pendingDeletes.current.set(
      block.id,
      setTimeout(() => void commit(), UNDO_MS)
    );
    toast.add({
      type: "info",
      title: `Deleted ${title}`,
      duration: UNDO_MS,
      actionProps: { children: "Undo", onClick: restore },
    });
  };

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const empty = blocks.length === 0 && !draft;
  const loading = profile.id === 0;

  return (
    <section aria-labelledby="blocks-heading" className="space-y-[13px] font-prism">
      <div className="flex flex-wrap items-center justify-between gap-[13px]">
        <h2
          id="blocks-heading"
          className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2"
        >
          <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
          Blocks
        </h2>
        {!empty && (
          <Button size="lg" className="max-md:w-full" onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden />
            Add block
          </Button>
        )}
      </div>

      <p id="reorder-help" className="sr-only">
        Press Space to pick up, arrow keys to move, Space to drop.
      </p>

      {loading ? (
        <div className="prism-glass-clear" aria-busy="true" aria-label="Loading blocks">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="flex h-commit items-center gap-3 border-b border-prism-line px-4 last:border-b-0"
            >
              <span className="h-[21px] w-[21px] rounded-prism-8 bg-prism-line" />
              <span className="h-[13px] w-[144px] rounded-prism-8 bg-prism-line" />
            </div>
          ))}
        </div>
      ) : empty ? (
        <EmptyState
          icon={LayoutGrid}
          title="Add your first block"
          description="Links, music, videos and your creator pool appear here in the order visitors see them."
          action={
            <Button size="lg" onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden />
              Add block
            </Button>
          }
        />
      ) : (
        <div className="prism-glass-clear px-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{
              announcements,
              screenReaderInstructions: {
                draggable: "Press Space to pick up, arrow keys to move, Space to drop.",
              },
            }}
          >
            <SortableContext
              items={blocks.map(b => String(b.id))}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((block, index) =>
                block.id === draftCreatedId ? null : (
                  <BlockRow
                    key={block.id}
                    block={block}
                    index={index}
                    total={blocks.length}
                    open={selectedBlockId === block.id}
                    onToggle={() => open(selectedBlockId === block.id ? null : block.id)}
                    onChange={config => updateBlock(block.id, config)}
                    onMove={to => reorderBlocks(arrayMove(blocks, index, to))}
                    onDelete={() => remove(block)}
                    onToggleHidden={() =>
                      updateBlock(block.id, {
                        ...block.config,
                        hidden: !(block.config as { hidden?: boolean }).hidden,
                      })
                    }
                  />
                )
              )}
            </SortableContext>
          </DndContext>
          {draft && (
            <BlockRow
              block={draftCreatedId !== null ? { ...draft, id: draftCreatedId } : draft}
              draft={draftCreatedId === null}
              open
              index={blocks.length}
              total={blocks.length + 1}
              // Collapsing a draft with no valid value removes it (037 I14)
              onToggle={() => {
                if (draftCreatedId !== null) selectBlock(null);
                closeDraft();
              }}
              onChange={config => void onDraftChange(config)}
              onMove={() => undefined}
              onDelete={() => {
                const created = blocks.find(b => b.id === draftCreatedId);
                closeDraft();
                if (created) remove(created);
              }}
              onToggleHidden={() => undefined}
            />
          )}
        </div>
      )}

      <AddBlockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        blocks={blocks}
        onAddLink={async config => {
          const created = await addBlock({
            id: 0,
            type: "link",
            order: 0,
            config: config as BlockType["config"],
          } as BlockType);
          setDialogOpen(false);
          open(created.id);
        }}
        onPick={pick}
        onOpenExisting={id => open(id)}
      />
    </section>
  );
}

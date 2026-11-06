"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, X } from "lucide-react";
import type {
  AccessDecision,
  BlockReveal,
  BlockType,
  ContentGate,
  MediaBlock as MediaBlockT,
  TextBlock as TextBlockT,
  ThemeConfig,
} from "@repo/constants";
import { CREATOR_FOCUS, CreatorButton } from "@/components/blocks/frame";
import { MediaBlock } from "@/components/blocks/MediaBlock";
import { TextBlock } from "@/components/blocks/text/TextBlock";
import { UnlockCard } from "@/components/content/gating";
import { SITE_CONTENT_COPY } from "@/components/content/copy";
import { trpcClient } from "@/lib/trpc";

const g = SITE_CONTENT_COPY.gate;
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Where a gated link opens: the server's /go redirect, never the destination. */
export function goHref(blockId: number) {
  return `${API}/go/${blockId}`;
}

/**
 * GQ2-2: the block the page's one stake notice sits under, the first gated block
 * behind a stake rule, or null when no block on the page is (decision D2).
 */
export function stakeNoticeBlockId(
  blocks: Array<{ id: number; gated?: boolean; gate?: unknown }>
): number | null {
  const first = blocks.find(
    block => block.gated && (block.gate as { stake?: boolean } | undefined)?.stake === true
  );
  return first?.id ?? null;
}

type Opened = { decision: AccessDecision; block: BlockReveal | null };

/**
 * A gated link, text or media block on a creator's page (access gating G3,
 * spec 3.9 and 3.10). The page has only the label, platform and rule summary.
 * A link opens through /go; text and media open through access.openBlock and
 * render in place. A refusal opens the unlock sheet with one next step.
 */
export function GatedBlock({
  block,
  theme,
  handle,
  decision,
  autoOpen = false,
  onChanged,
}: {
  block: BlockType;
  theme: ThemeConfig;
  handle: string;
  /** From checkPage after hydration, or null while unknown */
  decision: AccessDecision | null;
  /** ?unlock=<blockId>: /go sent the visitor back to this block */
  autoOpen?: boolean;
  onChanged: () => void;
}) {
  const gate = (block.gate ?? { kind: "any", summary: "", stake: false }) as ContentGate;
  const config = block.config as { label?: string; platform?: string };
  const [sheet, setSheet] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [failed, setFailed] = useState(false);

  const openBlock = useCallback(async () => {
    setFailed(false);
    try {
      const result = (await trpcClient.access.openBlock.query({ blockId: block.id })) as Opened;
      setOpened(result);
      return result;
    } catch {
      setFailed(true);
      return null;
    }
  }, [block.id]);

  // Text and media open in place for a viewer who qualifies
  useEffect(() => {
    if (decision?.allowed && block.type !== "link") void openBlock();
  }, [decision?.allowed, block.type, openBlock]);

  useEffect(() => {
    if (!autoOpen) return;
    setSheet(true);
    void openBlock();
  }, [autoOpen, openBlock]);

  const revealed = opened?.decision.allowed ? opened.block : null;
  if (revealed?.kind === "text") {
    return (
      <TextBlock
        block={
          {
            ...block,
            config: { content: revealed.content, platform: revealed.platform },
          } as TextBlockT
        }
        theme={theme}
      />
    );
  }
  if (revealed?.kind === "media") {
    return (
      <MediaBlock
        block={{ ...block, config: { ...revealed } } as unknown as MediaBlockT}
        theme={theme}
      />
    );
  }

  const open = decision?.allowed === true;
  const label =
    config.label ||
    (block.type === "text" ? g.lockedText : block.type === "media" ? g.lockedMedia : g.locked);
  const Icon = open ? LockOpen : Lock;

  return (
    <div className="w-full">
      {block.type === "link" && open ? (
        <CreatorButton
          theme={theme}
          icon={<LockOpen aria-hidden className="h-5 w-5" />}
          label={label}
          href={goHref(block.id)}
        />
      ) : (
        <CreatorButton
          theme={theme}
          icon={<Icon aria-hidden className="h-5 w-5" />}
          label={`${label}, ${open ? g.unlocked : g.lockedFor(gate.summary)}`}
          onClick={() => {
            setSheet(true);
            void openBlock();
          }}
        />
      )}

      {sheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={g.lockedFor(gate.summary)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-[13px] sm:items-center"
          onClick={event => event.target === event.currentTarget && setSheet(false)}
          onKeyDown={event => event.key === "Escape" && setSheet(false)}
        >
          <div className="relative w-full max-w-[440px] rounded-[21px] bg-white p-[8px] text-[#16152B] shadow-xl">
            <button
              type="button"
              onClick={() => setSheet(false)}
              aria-label={SITE_CONTENT_COPY.close}
              className={`absolute right-[8px] top-[8px] flex h-[44px] w-[44px] items-center justify-center rounded-full ${CREATOR_FOCUS}`}
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
            <p className="px-[13px] pt-[13px] text-[17px] font-semibold">{label}</p>
            {failed ? (
              <p role="alert" className="p-[13px] text-[15px]">
                {g.failed}
              </p>
            ) : !opened ? (
              <p role="status" className="p-[13px] text-[15px] opacity-80">
                {g.checking}
              </p>
            ) : opened.decision.allowed && opened.block?.kind === "link" ? (
              <div className="p-[13px]">
                <a
                  href={goHref(block.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#16152B] px-[21px] text-[16px] font-semibold text-white ${CREATOR_FOCUS}`}
                >
                  {g.openLink}
                </a>
              </div>
            ) : opened.decision.allowed ? null : (
              <div className="px-[13px] pb-[13px]">
                <UnlockCard
                  decision={opened.decision}
                  gate={gate}
                  handle={handle}
                  onFollowed={() => {
                    onChanged();
                    void openBlock().then(result => {
                      if (result?.decision.allowed && result.block?.kind !== "link")
                        setSheet(false);
                    });
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

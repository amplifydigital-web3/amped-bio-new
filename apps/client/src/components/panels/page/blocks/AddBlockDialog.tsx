import { useState, type KeyboardEvent } from "react";
import {
  Check,
  Coins,
  FileText,
  IdCard,
  Link2,
  Loader2,
  Plus,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { BsTelegram } from "react-icons/bs";
import type { IconType } from "react-icons/lib";
import {
  SINGLETON_BLOCK_TYPES,
  TELEGRAM_LINK,
  type BlockType,
  type MediaBlockPlatform,
} from "@repo/constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@repo/ui";
import { getPlatformIcon } from "@/utils/platforms";
import { FieldError, LinkFields } from "./LinkFields";
import { emptyLink, linkConfig, type LinkValue } from "./linkValue";

// Screen Review 034 and 035. One Add block dialog: the Link section first,
// then MEDIA, UTILITY, PEOPLE and WEB3 tiles. Picking a tile closes the dialog
// and the new block opens inline in the list (D18). People (Build Board #30,
// board fb4) holds the Follow button and Followers blocks; both are
// singletons, like the referral block, and show "On your page" once added.

export type NewBlockKind =
  | { type: "media"; platform: MediaBlockPlatform }
  | { type: "text" }
  | { type: "pool" }
  | { type: "referral" }
  | { type: "follow" }
  | { type: "followers" }
  | { type: "rnsid" };

type SingletonType = (typeof SINGLETON_BLOCK_TYPES)[number];

function isSingleton(type: string): type is SingletonType {
  return (SINGLETON_BLOCK_TYPES as readonly string[]).includes(type);
}

const fanGraphOn = import.meta.env.VITE_FAN_GRAPH === "true";
const rnsOn = import.meta.env.VITE_SHOW_RNS === "true";

type Tile = { label: string; icon: LucideIcon | IconType; kind: NewBlockKind };

const SECTIONS: { eyebrow: string; tiles: Tile[] }[] = [
  {
    eyebrow: "Media",
    tiles: [
      {
        label: "Spotify",
        icon: getPlatformIcon("spotify"),
        kind: { type: "media", platform: "spotify" },
      },
      {
        label: "YouTube",
        icon: getPlatformIcon("youtube"),
        kind: { type: "media", platform: "youtube" },
      },
      {
        label: "Instagram post",
        icon: getPlatformIcon("instagram"),
        kind: { type: "media", platform: "instagram" },
      },
      {
        label: "X post",
        icon: getPlatformIcon("twitter"),
        kind: { type: "media", platform: "twitter" },
      },
      {
        label: "TikTok",
        icon: getPlatformIcon("tiktok"),
        kind: { type: "media", platform: "tiktok" },
      },
      {
        label: "Facebook post",
        icon: getPlatformIcon("facebook"),
        kind: { type: "media", platform: "facebook" },
      },
      {
        label: "Vimeo",
        icon: getPlatformIcon("vimeo"),
        kind: { type: "media", platform: "vimeo" },
      },
    ],
  },
  {
    eyebrow: "Utility",
    tiles: [
      { label: "Text", icon: FileText, kind: { type: "text" } },
      { label: "Referral link", icon: Link2, kind: { type: "referral" } },
    ],
  },
  ...(fanGraphOn
    ? [
        {
          eyebrow: "People",
          tiles: [
            { label: "Follow button", icon: UserPlus, kind: { type: "follow" as const } },
            { label: "Followers", icon: UsersRound, kind: { type: "followers" as const } },
          ],
        },
      ]
    : []),
  // Identity (Build Board #33, Screen Review 112): the RNS ID block, one per page
  ...(rnsOn
    ? [
        {
          eyebrow: "Identity",
          tiles: [{ label: "RNS ID", icon: IdCard, kind: { type: "rnsid" as const } }],
        },
      ]
    : []),
  { eyebrow: "Web3", tiles: [{ label: "Creator pool", icon: Coins, kind: { type: "pool" } }] },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </p>
  );
}

/** Two columns of 44 secondary lens tiles, one tab stop per section (035 I04, I05). */
function TileGrid({
  label,
  tiles,
  onPage,
  onPick,
}: {
  label: string;
  tiles: Tile[];
  /** Singleton types already on the page */
  onPage: Set<string>;
  onPick: (kind: NewBlockKind) => void;
}) {
  const [focus, setFocus] = useState(0);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 2,
      ArrowUp: -2,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = Math.min(tiles.length - 1, Math.max(0, focus + move));
    setFocus(next);
    event.currentTarget.querySelectorAll<HTMLElement>("button")[next]?.focus();
  };
  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-[13px]"
    >
      {tiles.map((tile, index) => {
        const added = isSingleton(tile.kind.type) && onPage.has(tile.kind.type);
        return (
          <button
            key={tile.label}
            type="button"
            tabIndex={index === focus ? 0 : -1}
            onClick={() => onPick(tile.kind)}
            className="prism-btn-secondary prism-focus flex h-touch min-w-0 items-center gap-2 rounded-prism-13 px-[13px] text-left text-prism-label font-semibold text-prism-ink"
          >
            <tile.icon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
            <span className="min-w-0 flex-1 truncate">{tile.label}</span>
            {added && (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-prism-meta font-normal text-prism-ink-2">
                On your page
                <Check aria-hidden className="h-[21px] w-[21px]" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AddBlockDialog({
  open,
  onOpenChange,
  blocks,
  onAddLink,
  onPick,
  onOpenExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: BlockType[];
  /** Creates the link; resolves when stored, throws on failure */
  onAddLink: (config: { platform: string; url: string; label: string }) => Promise<void>;
  onPick: (kind: NewBlockKind) => void;
  onOpenExisting: (id: number) => void;
}) {
  const [link, setLink] = useState<LinkValue>(emptyLink);
  const [submitted, setSubmitted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPage = new Set(blocks.map(b => b.type).filter(isSingleton));
  const config = linkConfig(link);
  const duplicateOf = config
    ? blocks.find(b => b.type === "link" && b.config.url === config.url)
    : undefined;

  const reset = () => {
    setLink(emptyLink());
    setSubmitted(false);
    setFailed(false);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const add = async () => {
    setSubmitted(true);
    if (!config || adding) return;
    setAdding(true);
    setFailed(false);
    try {
      await onAddLink(config);
      reset();
    } catch {
      setFailed(true);
    } finally {
      setAdding(false);
    }
  };

  const pick = (kind: NewBlockKind) => {
    if (isSingleton(kind.type) && onPage.has(kind.type)) {
      const existing = blocks.find(b => b.type === kind.type);
      close(false);
      if (existing) onOpenExisting(existing.id);
      return;
    }
    close(false);
    onPick(kind);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[848px]">
        <DialogHeader>
          <DialogTitle>Add block</DialogTitle>
        </DialogHeader>

        <div className="space-y-[21px] font-prism">
          <form
            onSubmit={event => {
              event.preventDefault();
              void add();
            }}
            className="space-y-[13px]"
          >
            <Eyebrow>Link</Eyebrow>
            <LinkFields
              value={link}
              onChange={setLink}
              autoFocus
              errorsVisible={submitted}
              duplicate={
                duplicateOf ? (
                  <>
                    This link is already on your page.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        close(false);
                        onOpenExisting(duplicateOf.id);
                      }}
                      className="prism-focus font-semibold text-prism-nav hover:underline"
                    >
                      Open it
                    </button>
                  </>
                ) : undefined
              }
            />
            {failed && (
              <div className="flex items-center gap-2">
                <FieldError id="add-link-error">
                  The link was not added. Check your connection, then select Retry.
                </FieldError>
                <Button type="submit" variant="ghost">
                  Retry
                </Button>
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={adding} aria-busy={adding}>
              {adding ? (
                <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Plus aria-hidden />
              )}
              {adding ? "Adding" : "Add link"}
            </Button>
          </form>

          <hr className="border-prism-line" />

          {SECTIONS.map(section => (
            <div key={section.eyebrow} className="space-y-[13px]">
              <Eyebrow>{section.eyebrow}</Eyebrow>
              <TileGrid
                label={section.eyebrow}
                tiles={section.tiles}
                onPage={onPage}
                onPick={pick}
              />
            </div>
          ))}
        </div>

        <DialogFooter className={cn("sm:justify-start")}>
          <Button variant="ghost" asChild>
            <a href={TELEGRAM_LINK} target="_blank" rel="noopener noreferrer">
              <BsTelegram aria-hidden className="text-prism-ink-2" />
              Suggest a block
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

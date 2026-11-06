import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  AtSign,
  BadgeCheck,
  Calendar,
  ChartBar,
  ChartLine,
  Check,
  CircleHelp,
  ClipboardList,
  Code,
  Coins,
  Contact,
  Crown,
  Disc,
  FileText,
  Files,
  Folder,
  Gem,
  Gift,
  GraduationCap,
  Heading,
  Heart,
  IdCard,
  Images,
  LayoutGrid,
  Library,
  Link2,
  List,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Milestone,
  Music,
  Newspaper,
  Pen,
  Percent,
  Podcast,
  Presentation,
  Quote,
  Radio,
  Rss,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Target,
  Ticket,
  Timer,
  Trophy,
  UserPlus,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { BsTelegram } from "react-icons/bs";
import type { IconType } from "react-icons/lib";
import {
  BLOCK_CATALOG,
  BLOCK_FAMILIES,
  TELEGRAM_LINK,
  catalogEntryIsNew,
  catalogEntryShown,
  searchCatalog,
  type BlockFamily,
  type BlockType,
  type CatalogEntry,
  type CatalogIcon,
} from "@repo/constants";
import { cn } from "@repo/ui";
import { getPlatformIcon } from "@/utils/platforms";
import { trackGAEvent } from "@/utils/ga";
import { isFeatureOn } from "@/config/featureFlags";
import type { NewBlockKind } from "./AddBlockDialog";

// Block Review v2, the Add block catalog (Build Board #54, wave 1 spec
// section 9, board ab1). Below the Link section: search, family chips, then
// every block by family from BLOCK_CATALOG. Coming soon tiles read out but
// are not pickable. Picking an available tile adds it as today.

const ICONS: Record<Exclude<CatalogIcon, `platform:${string}`>, LucideIcon> = {
  text: FileText,
  heading: Heading,
  images: Images,
  code: Code,
  folder: Folder,
  at: AtSign,
  megaphone: Megaphone,
  files: Files,
  video: Video,
  music: Music,
  post: Newspaper,
  grid: LayoutGrid,
  rss: Rss,
  podcast: Podcast,
  disc: Disc,
  library: Library,
  mail: Mail,
  "message-square": MessageSquare,
  clipboard: ClipboardList,
  timer: Timer,
  "user-plus": UserPlus,
  users: UsersRound,
  help: CircleHelp,
  contact: Contact,
  presentation: Presentation,
  ticket: Ticket,
  calendar: Calendar,
  gift: Gift,
  chart: ChartBar,
  quote: Quote,
  milestone: Milestone,
  "map-pin": MapPin,
  messages: MessagesSquare,
  sparkles: Sparkles,
  tag: Tag,
  "shopping-bag": ShoppingBag,
  graduation: GraduationCap,
  pen: Pen,
  target: Target,
  percent: Percent,
  list: List,
  store: Store,
  heart: Heart,
  "badge-check": BadgeCheck,
  radio: Radio,
  "id-card": IdCard,
  send: Send,
  "message-circle": MessageCircle,
  coins: Coins,
  link: Link2,
  gem: Gem,
  "line-chart": ChartLine,
  trophy: Trophy,
  crown: Crown,
};

export function catalogIcon(icon: CatalogIcon): LucideIcon | IconType {
  if (icon.startsWith("platform:")) return getPlatformIcon(icon.slice("platform:".length));
  return ICONS[icon as keyof typeof ICONS] ?? FileText;
}

type Via = "browse" | "search";

function track(action: string, label: string) {
  trackGAEvent(action, "add_block", label);
}

function Eyebrow({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </h3>
  );
}

function Badge({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-prism-meta font-semibold",
        filled ? "bg-prism-nav text-white" : "border border-prism-line text-prism-ink-2"
      )}
    >
      {children}
    </span>
  );
}

/** Tiles in a grid, one tab stop per grid, arrow keys move (035 I04, I05) */
function CatalogGrid({
  labelledBy,
  entries,
  onPage,
  onSelect,
}: {
  labelledBy: string;
  entries: CatalogEntry[];
  onPage: (entry: CatalogEntry) => boolean;
  onSelect: (entry: CatalogEntry) => void;
}) {
  const [focus, setFocus] = useState(0);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const columns = Math.max(
      1,
      getComputedStyle(event.currentTarget).gridTemplateColumns.split(" ").filter(Boolean).length
    );
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = Math.min(entries.length - 1, Math.max(0, focus + move));
    setFocus(next);
    event.currentTarget.querySelectorAll<HTMLElement>("button")[next]?.focus();
  };
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {entries.map((entry, index) => {
        const Icon = catalogIcon(entry.icon);
        const soon = entry.status === "soon";
        const added = !soon && onPage(entry);
        const isNew = catalogEntryIsNew(entry);
        return (
          <button
            key={entry.id}
            type="button"
            tabIndex={index === Math.min(focus, entries.length - 1) ? 0 : -1}
            aria-disabled={soon || undefined}
            onFocus={() => setFocus(index)}
            onClick={() => onSelect(entry)}
            className={cn(
              "prism-focus flex min-h-touch min-w-0 items-center gap-3 rounded-prism-13 px-[13px] py-2 text-left",
              soon ? "cursor-default border border-dashed border-prism-line" : "prism-btn-secondary"
            )}
          >
            <Icon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-prism-label font-semibold text-prism-ink">
                {entry.name}
              </span>
              <span className="block truncate text-prism-meta text-prism-ink-2">
                {soon ? "Coming soon" : added ? "On your page" : entry.line}
              </span>
            </span>
            {added ? (
              <Check aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-nav" />
            ) : (
              !soon && (
                <>
                  {isNew && <Badge filled>New</Badge>}
                  {entry.singleton === true && <Badge>One per page</Badge>}
                  {entry.singleton === "bar" && <Badge>Bar: one per page</Badge>}
                </>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}

function blocksLabel(n: number) {
  return n === 1 ? "1 block" : `${n} blocks`;
}

export function AddBlockCatalog({
  blocks,
  onPick,
  onOpenExisting,
}: {
  blocks: BlockType[];
  onPick: (kind: NewBlockKind) => void;
  onOpenExisting: (id: number) => void;
}) {
  const baseId = useId();
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<BlockFamily | "all">("all");
  const shown = BLOCK_CATALOG.filter(entry => catalogEntryShown(entry, isFeatureOn));
  const searching = query.trim().length > 0;
  const results = searching ? searchCatalog(shown, query, family) : [];
  const emptyReported = useRef(false);

  useEffect(() => {
    track("add_block_opened", "");
  }, []);

  // Reports an empty search once per empty run, with the count only, never the text
  useEffect(() => {
    if (searching && results.length === 0) {
      if (!emptyReported.current) track("add_block_search_empty", "0");
      emptyReported.current = true;
    } else {
      emptyReported.current = false;
    }
  }, [searching, results.length]);

  const existingFor = (entry: CatalogEntry) =>
    entry.singletonType ? blocks.find(b => b.type === entry.singletonType) : undefined;

  const select = (entry: CatalogEntry, via: Via) => {
    if (entry.status === "soon" || !entry.add) {
      track("add_block_soon_tapped", entry.id);
      return;
    }
    const existing = existingFor(entry);
    if (existing) {
      onOpenExisting(existing.id);
      return;
    }
    track("add_block_picked", `${entry.add.type},${via}`);
    onPick(entry.add as NewBlockKind);
  };

  const families = BLOCK_FAMILIES.filter(f => family === "all" || f.id === family);
  const resultsId = `${baseId}-results`;

  return (
    <div className="space-y-[21px]">
      <div className="space-y-[13px]">
        <label htmlFor={`${baseId}-search`} className="sr-only">
          Search blocks
        </label>
        <div className="prism-well prism-focus flex h-touch w-full items-center gap-2 px-[13px] focus-within:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]">
          <Search aria-hidden className="h-[18px] w-[18px] shrink-0 text-prism-ink-2" />
          <input
            id={`${baseId}-search`}
            type="search"
            value={query}
            placeholder="Search blocks"
            onChange={event => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-2"
          />
        </div>

        <fieldset>
          <legend className="sr-only">Block family</legend>
          <div className="flex flex-wrap gap-2">
            {[{ id: "all" as const, label: "All" }, ...BLOCK_FAMILIES].map(option => {
              const selected = family === option.id;
              return (
                <label key={option.id} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name={`${baseId}-family`}
                    value={option.id}
                    checked={selected}
                    onChange={() => setFamily(option.id)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "inline-flex h-touch items-center whitespace-nowrap rounded-full px-[13px] text-prism-label text-prism-ink peer-focus-visible:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
                      selected
                        ? "bg-prism-nav-tint font-semibold ring-[1.5px] ring-prism-nav"
                        : "prism-well"
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {searching ? (
        <div className="space-y-[13px]" aria-live="polite">
          {results.length > 0 ? (
            <>
              <Eyebrow id={resultsId}>
                {results.length === 1
                  ? `1 block matches ${query.trim()}`
                  : `${results.length} blocks match ${query.trim()}`}
              </Eyebrow>
              <CatalogGrid
                key={`${query}-${family}`}
                labelledBy={resultsId}
                entries={results}
                onPage={entry => Boolean(existingFor(entry))}
                onSelect={entry => select(entry, "search")}
              />
            </>
          ) : (
            <div className="prism-well flex flex-col gap-2 rounded-prism-13 p-[13px] sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-prism-meta text-prism-ink">
                No blocks match {query.trim()}. Paste the link above to add it as a link.
              </p>
              <a
                href={TELEGRAM_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="prism-focus inline-flex h-touch shrink-0 items-center gap-2 rounded-prism-13 px-2 text-prism-label font-semibold text-prism-nav hover:underline"
              >
                <BsTelegram aria-hidden />
                Suggest a block
              </a>
            </div>
          )}
        </div>
      ) : (
        families.map(f => {
          const entries = shown.filter(entry => entry.family === f.id);
          if (entries.length === 0) return null;
          const headingId = `${baseId}-${f.id}`;
          return (
            <div key={f.id} className="space-y-[13px]">
              <Eyebrow id={headingId}>
                {f.label}, {blocksLabel(entries.length)}
              </Eyebrow>
              <CatalogGrid
                key={family}
                labelledBy={headingId}
                entries={entries}
                onPage={entry => Boolean(existingFor(entry))}
                onSelect={entry => select(entry, "browse")}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

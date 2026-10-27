import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Palette, Search, SearchX, X } from "lucide-react";
import { Button, Chip, EmptyState, ErrorCard, Skeleton, trpc } from "@repo/ui";
import { TELEGRAM_LINK, type Collection, type MarketplaceTheme } from "@repo/constants";
import { useEditor } from "@/contexts/EditorContext";
import { useCollections } from "@/hooks/useCollections";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useThemeActions } from "../kit/useThemeActions";
import { toast } from "@/components/ui/toast";
import { ThemeCard } from "./ThemeCard";

// Screen Review 032. Themes tab: the current theme, collection chips, search,
// and a grid of theme cards. One card can be selected at a time; selecting it
// pins the live preview until Escape, another selection, or leaving Design.

const SEARCH_DEBOUNCE_MS = 233;
const SKELETON_DELAY_MS = 400;
const SECTION_PREVIEW_COUNT = 6;

function useDelayedFlag(active: boolean, delay: number) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);
  return shown;
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setInView(true);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);
  return [ref, inView] as const;
}

type ServerTheme = {
  id: number;
  name: string;
  description?: string | null;
  thumbnailImage?: { url?: string | null } | null;
  config?: MarketplaceTheme["theme"];
  user?: { id?: number | null } | null;
};

function fromServerTheme(theme: ServerTheme): MarketplaceTheme {
  return {
    id: theme.id.toString(),
    name: theme.name,
    description: theme.description || "",
    thumbnail: theme.thumbnailImage?.url || "",
    tags: [],
    theme: theme.config || ({} as MarketplaceTheme["theme"]),
    // Admin marketplace themes have no owner: they are the locked themes
    user_id: theme.user?.id ?? null,
  } as MarketplaceTheme;
}

/** Themes for one collection. Server collections fetch once `enabled`. */
function useCollectionThemes(collection: Collection | undefined, enabled: boolean) {
  const serverId = collection?.isServer ? parseInt(collection.id) : NaN;
  const query = useQuery({
    ...trpc.themeGallery.getThemesByCategory.queryOptions({ id: serverId }),
    enabled: enabled && Number.isFinite(serverId),
  });
  if (!collection) return { themes: [], loading: false, error: false, retry: () => {} };
  if (!collection.isServer) {
    return { themes: collection.themes ?? [], loading: false, error: false, retry: () => {} };
  }
  return {
    themes: (
      ((query.data as { themes?: unknown[] } | undefined)?.themes ?? []) as ServerTheme[]
    ).map(fromServerTheme),
    loading: query.isLoading && enabled,
    error: query.isError,
    retry: () => void query.refetch(),
  };
}

function matches(theme: MarketplaceTheme, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    theme.name.toLowerCase().includes(needle) ||
    (theme.tags ?? []).some(tag => tag.toLowerCase().includes(needle))
  );
}

function CardSkeletons({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-[21px] md:grid-cols-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="prism-glass-clear space-y-2 p-2">
          <Skeleton className="aspect-[3/4] w-full rounded-prism-13" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/** One radiogroup of cards with roving focus (arrows, Home, End). */
function ThemeGrid({
  themes,
  selectedId,
  onSelect,
  mobile,
  label,
}: {
  themes: MarketplaceTheme[];
  selectedId: string | null;
  onSelect: (card: MarketplaceTheme | null) => void;
  mobile: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedIndex = themes.findIndex(t => t.id === selectedId);
  const focusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const radios = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(":scope > [role=radio]") ?? []
    );
    const current = radios.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    const columns = mobile ? 2 : 3;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    };
    let next: number | null = null;
    if (event.key in moves)
      next = Math.min(radios.length - 1, Math.max(0, current + moves[event.key]));
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = radios.length - 1;
    if (next === null) return;
    event.preventDefault();
    radios.forEach((radio, i) => (radio.tabIndex = i === next ? 0 : -1));
    radios[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 items-start gap-[21px] md:grid-cols-3"
    >
      {themes.map((card, index) => (
        <ThemeCard
          key={card.id}
          card={card}
          selected={card.id === selectedId}
          focusable={index === focusIndex}
          mobile={mobile}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function CurrentTheme({ onEditStyle }: { onEditStyle: () => void }) {
  const { theme } = useEditor();
  const { makeEditableCopy, pending } = useThemeActions();
  const locked = theme.user_id === null;
  const thumbnail = (theme as { thumbnail?: string | null }).thumbnail;

  const copy = async () => {
    try {
      await makeEditableCopy();
      toast.add({ type: "success", title: "Editable copy made" });
    } catch {
      toast.add({
        type: "error",
        title: "Could not make an editable copy",
        actionProps: { children: "Retry", onClick: () => void copy() },
      });
    }
  };

  return (
    <section
      aria-label="Current theme"
      className="prism-glass-clear mb-[21px] flex flex-wrap items-center gap-[13px] p-[13px] font-prism"
    >
      <span className="h-[55px] w-[55px] shrink-0 overflow-hidden rounded-prism-13 bg-white/60">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Palette aria-hidden className="h-[21px] w-[21px] text-prism-ink-3" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-prism-eyebrow uppercase text-prism-ink-2">Current theme</p>
        <p className="truncate text-prism-label font-bold text-prism-ink">
          {theme.name || "My theme"}
        </p>
        <p className="text-prism-meta text-prism-ink-2">
          {locked ? "Locked marketplace theme" : "Your theme"}
        </p>
      </div>
      <div className="flex w-full flex-wrap gap-2 pl-[55px] sm:w-auto sm:shrink-0 sm:justify-end sm:pl-0">
        {locked ? (
          <Button
            variant="ghost"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void copy()}
          >
            Make an editable copy
          </Button>
        ) : (
          <Button variant="ghost" onClick={onEditStyle}>
            Edit style
          </Button>
        )}
      </div>
    </section>
  );
}

/** All view: one section per collection, first six cards and See all. */
function CollectionSection({
  collection,
  query,
  selectedId,
  onSelect,
  onSeeAll,
  mobile,
}: {
  collection: Collection;
  query: string;
  selectedId: string | null;
  onSelect: (card: MarketplaceTheme | null) => void;
  onSeeAll: () => void;
  mobile: boolean;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  const { themes, loading, error, retry } = useCollectionThemes(collection, inView);
  const showSkeleton = useDelayedFlag(loading || !inView, SKELETON_DELAY_MS);
  const visible = themes.filter(t => matches(t, query));
  const total = collection.isServer && !themes.length ? collection.themeCount : visible.length;

  // A search hides sections without matches once they have loaded
  if (query && !loading && inView && !error && visible.length === 0) return null;

  return (
    <section ref={ref} aria-labelledby={`collection-${collection.id}`} className="space-y-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id={`collection-${collection.id}`}
          className="text-prism-eyebrow uppercase text-prism-ink-2"
        >
          {collection.name}
        </h3>
        {total > SECTION_PREVIEW_COUNT && (
          <Button variant="link" className="h-auto min-h-0 p-0 text-prism-meta" onClick={onSeeAll}>
            See all {total}
          </Button>
        )}
      </div>
      {error ? (
        <ErrorCard title="Themes did not load" onRetry={retry} retryLabel="Retry" />
      ) : loading || !inView ? (
        showSkeleton ? (
          <CardSkeletons count={mobile ? 2 : 3} />
        ) : (
          <div className="h-[233px]" />
        )
      ) : (
        <ThemeGrid
          label={collection.name}
          themes={visible.slice(0, SECTION_PREVIEW_COUNT)}
          selectedId={selectedId}
          onSelect={onSelect}
          mobile={mobile}
        />
      )}
    </section>
  );
}

/** One collection: header, full grid, and its states. */
function CollectionView({
  collection,
  query,
  selectedId,
  onSelect,
  onBrowseAll,
  onClearSearch,
  mobile,
}: {
  collection: Collection;
  query: string;
  selectedId: string | null;
  onSelect: (card: MarketplaceTheme | null) => void;
  onBrowseAll: () => void;
  onClearSearch: () => void;
  mobile: boolean;
}) {
  const { themes, loading, error, retry } = useCollectionThemes(collection, true);
  const showSkeleton = useDelayedFlag(loading, SKELETON_DELAY_MS);
  const visible = themes.filter(t => matches(t, query));

  let body: React.ReactNode;
  if (error) {
    body = <ErrorCard title="Themes did not load" onRetry={retry} retryLabel="Retry" />;
  } else if (loading) {
    body = showSkeleton ? <CardSkeletons count={mobile ? 4 : 6} /> : null;
  } else if (themes.length === 0) {
    body = (
      <EmptyState
        icon={Palette}
        title="No themes here yet"
        description="We're adding themes to this collection."
        action={
          <Button variant="secondary" onClick={onBrowseAll}>
            Browse all themes
          </Button>
        }
      />
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title={`No themes match '${query}'`}
        action={
          <Button variant="secondary" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    );
  } else {
    body = (
      <ThemeGrid
        label="Themes"
        themes={visible}
        selectedId={selectedId}
        onSelect={onSelect}
        mobile={mobile}
      />
    );
  }

  const count = loading ? collection.themeCount : themes.length;

  return (
    <div className="space-y-[21px]">
      <header className="space-y-1">
        <p className="text-prism-eyebrow uppercase text-prism-ink-2">Collection</p>
        <h3 className="text-prism-panel-title text-prism-ink">{collection.name}</h3>
        {collection.description && (
          <p className="text-prism-body text-prism-ink-2">{collection.description}</p>
        )}
        <p className="text-prism-meta tabular-nums text-prism-ink-2">
          {count === 1 ? "1 theme" : `${count} themes`}
        </p>
      </header>
      {body}
    </div>
  );
}

export function ThemesTab({ onEditStyle }: { onEditStyle: () => void }) {
  const { collections, isLoading, error } = useCollections();
  const { setPreviewOverride } = useEditor();
  const mobile = useMediaQuery(PHONE_QUERY);
  const [params, setParams] = useSearchParams();
  const collectionId = params.get("collection") ?? "";
  const active = collections.find(c => c.id === collectionId);

  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const [selected, setSelected] = useState<MarketplaceTheme | null>(null);

  const pin = (card: MarketplaceTheme | null) => {
    setSelected(card);
    setPreviewOverride(
      card ? { config: card.theme, label: `Previewing ${card.name}. Not applied yet.` } : null
    );
  };

  // Hover previews end when the pointer leaves the grid: back to the pinned card
  const restorePinned = () => {
    setPreviewOverride(
      selected
        ? { config: selected.theme, label: `Previewing ${selected.name}. Not applied yet.` }
        : null
    );
  };

  // Escape clears the pinned preview anywhere in the tab
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selected) pin(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Leaving the tab clears any preview
  useEffect(() => () => setPreviewOverride(null), [setPreviewOverride]);

  const setCollection = (id: string) => {
    pin(null);
    setParams(
      current => {
        const next = new URLSearchParams(current);
        if (id) next.set("collection", id);
        else next.delete("collection");
        return next;
      },
      { replace: true }
    );
  };

  const chips = useMemo(
    () => [{ id: "", name: "All" }, ...collections.map(c => ({ id: c.id, name: c.name }))],
    [collections]
  );
  const showSkeleton = useDelayedFlag(isLoading, SKELETON_DELAY_MS);

  return (
    <div className="font-prism" onPointerLeave={restorePinned}>
      <CurrentTheme onEditStyle={onEditStyle} />

      <div
        role="radiogroup"
        aria-label="Collections"
        className="-mx-4 mb-[13px] flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:-mx-6 md:px-6"
      >
        {chips.map(chip => {
          const isSelected = chip.id === (active ? active.id : "");
          return (
            <Chip
              key={chip.id || "all"}
              role="radio"
              selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setCollection(chip.id)}
              onKeyDown={event => {
                const index = chips.indexOf(chip);
                const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                event.preventDefault();
                const next = chips[(index + step + chips.length) % chips.length];
                setCollection(next.id);
                const group = event.currentTarget.parentElement;
                requestAnimationFrame(() =>
                  group?.querySelector<HTMLElement>("[aria-checked=true]")?.focus()
                );
              }}
            >
              {chip.name}
            </Chip>
          );
        })}
      </div>

      <div className="prism-well mb-[21px] flex h-touch items-center gap-2 px-3">
        <Search aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-3" />
        <input
          type="search"
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Escape" && input) {
              event.stopPropagation();
              setInput("");
            }
          }}
          aria-label="Search themes"
          placeholder="Search by name or tag"
          className="min-w-0 flex-1 bg-transparent text-prism-body text-prism-ink outline-none placeholder:text-prism-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {input && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setInput("")}
            className="prism-focus flex h-[34px] w-[34px] items-center justify-center rounded-full"
          >
            <X aria-hidden className="h-4 w-4 text-prism-ink-2" />
          </button>
        )}
      </div>

      {isLoading && !collections.length ? (
        showSkeleton ? (
          <CardSkeletons count={mobile ? 4 : 6} />
        ) : null
      ) : error && !collections.length ? (
        <ErrorCard
          title="Themes did not load"
          retryLabel="Retry"
          onRetry={() => location.reload()}
        />
      ) : active ? (
        <CollectionView
          collection={active}
          query={query}
          selectedId={selected?.id ?? null}
          onSelect={pin}
          onBrowseAll={() => setCollection("")}
          onClearSearch={() => setInput("")}
          mobile={mobile}
        />
      ) : (
        <AllCollections
          collections={collections}
          query={query}
          selectedId={selected?.id ?? null}
          onSelect={pin}
          onSeeAll={setCollection}
          onClearSearch={() => setInput("")}
          mobile={mobile}
        />
      )}

      <p className="mt-[34px] text-prism-meta text-prism-ink-2">
        Missing a style you want?{" "}
        <a
          href={TELEGRAM_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="prism-focus font-semibold text-prism-nav underline-offset-2 hover:underline"
        >
          Suggest a collection
        </a>
      </p>
    </div>
  );
}

function AllCollections({
  collections,
  query,
  selectedId,
  onSelect,
  onSeeAll,
  onClearSearch,
  mobile,
}: {
  collections: Collection[];
  query: string;
  selectedId: string | null;
  onSelect: (card: MarketplaceTheme | null) => void;
  onSeeAll: (id: string) => void;
  onClearSearch: () => void;
  mobile: boolean;
}) {
  // Local collections are searchable at once; server ones filter as they load
  const localMatches = collections
    .filter(c => !c.isServer)
    .some(c => (c.themes ?? []).some(t => matches(t, query)));
  const hasServer = collections.some(c => c.isServer);

  return (
    <div className="space-y-[34px]">
      {collections.map(collection => (
        <CollectionSection
          key={collection.id}
          collection={collection}
          query={query}
          selectedId={selectedId}
          onSelect={onSelect}
          onSeeAll={() => onSeeAll(collection.id)}
          mobile={mobile}
        />
      ))}
      {query && !localMatches && !hasServer && (
        <EmptyState
          icon={SearchX}
          title={`No themes match '${query}'`}
          action={
            <Button variant="secondary" onClick={onClearSearch}>
              Clear search
            </Button>
          }
        />
      )}
    </div>
  );
}

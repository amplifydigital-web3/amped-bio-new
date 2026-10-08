import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  SearchX,
  Trash2,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  trpc,
  trpcClient,
} from "@repo/ui";
import { ConfirmDialog, SearchWell, retryToast } from "../../kit/parts";
import { SlabPager } from "../../kit/Slab";
import { WordBadge } from "../../kit/WordBadge";
import { formatCount } from "../../kit/format";
import { EditThemeDialog, type EditableTheme, type MissingMedia } from "./EditThemeDialog";

// Screen Review 088 I04, I05, I13. The Themes tab: a filter bar (search,
// Collection select, New theme), a grid of G1 clear cards 306 wide with the
// creator made thumbnail untouched, Edit and an overflow with Delete, the
// shared loading, error and empty states, and the slab footer pager.

const PAGE_SIZE = 12;
const ALL = "all";

interface ThemeItem {
  id: number;
  name: string | null;
  description: string | null;
  category?: { id: number; title: string } | null;
  thumbnailImage?: { url: string } | null;
}

function ThemeCard({
  theme,
  onEdit,
  onDelete,
}: {
  theme: ThemeItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const name = theme.name || "Untitled theme";
  return (
    <article className="prism-glass-clear flex flex-col gap-2 !rounded-prism-21 p-2 font-prism">
      <div className="h-[202px] overflow-hidden rounded-prism-13 bg-white/60">
        {theme.thumbnailImage?.url && !failed ? (
          <img
            src={theme.thumbnailImage.url}
            alt={`${name} thumbnail`}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon
              aria-hidden
              className="h-[34px] w-[34px] text-prism-ink-3"
              strokeWidth={1.5}
            />
            <span className="sr-only">No thumbnail</span>
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1 px-2">
        <h3 className="text-prism-label font-bold text-prism-ink">{name}</h3>
        {theme.description && (
          <p className="line-clamp-2 text-prism-meta text-prism-ink-2">{theme.description}</p>
        )}
        <p className="flex items-center gap-2 pt-1 text-prism-meta text-prism-ink-2">
          {theme.category?.title}
          <WordBadge tone="nav" solid>
            Admin
          </WordBadge>
        </p>
      </div>
      <div className="flex items-center gap-2 px-1 pb-1">
        <Button variant="secondary" className="flex-1" onClick={onEdit} aria-label={`Edit ${name}`}>
          <Pencil aria-hidden />
          Edit
        </Button>
        <Menu>
          <MenuTrigger
            aria-label={`More actions for ${name}`}
            className="prism-icon-btn prism-focus"
          >
            <MoreHorizontal aria-hidden className="h-5 w-5" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem destructive onSelect={onDelete}>
              <Trash2 aria-hidden />
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </article>
  );
}

export function ThemesTab() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EditableTheme | null>(null);
  const [missing, setMissing] = useState<MissingMedia[]>([]);
  const [deleting, setDeleting] = useState<ThemeItem | null>(null);

  const categories = useQuery(trpc.admin.themes.getThemeCategories.queryOptions());
  const themes = useQuery({
    ...trpc.admin.themes.getThemes.queryOptions({
      page,
      limit: PAGE_SIZE,
      search: search.trim() || undefined,
      category_id: collection === ALL ? undefined : Number(collection),
    }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => setPage(1), [search, collection]);

  // 088 I03: /themes?edit=<id>&missing=thumbnail opens that theme's Edit;
  // the new theme form passes its name and description in the route state
  const location = useLocation();
  const editParam = params.get("edit");
  useEffect(() => {
    if (!editParam) return;
    const state = (location.state ?? {}) as { name?: string; description?: string };
    setMissing(
      (params.get("missing") ?? "")
        .split(",")
        .filter((m): m is MissingMedia => m === "thumbnail" || m === "background")
    );
    setEditing({ id: Number(editParam), name: state.name ?? "", description: state.description });
    const next = new URLSearchParams(params);
    next.delete("edit");
    next.delete("missing");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam]);

  const deleteTheme = useMutation({
    mutationFn: (id: number) => trpcClient.admin.themes.deleteTheme.mutate({ id }),
    onSuccess: (_data, id) => {
      const name = deleting?.name || "Theme";
      setDeleting(null);
      toast.success(`${name} deleted`);
      void themes.refetch();
      void id;
    },
    onError: (error, id) => {
      setDeleting(null);
      // The server refuses while people use the theme; say so in plain words
      const inUse = error instanceof Error && /use/i.test(error.message);
      if (inUse) toast.error("This theme is in use, so it was not deleted.");
      else retryToast("The theme was not deleted", () => deleteTheme.mutate(id));
    },
  });

  const list = (themes.data?.themes ?? []) as ThemeItem[];
  const pagination = themes.data?.pagination;
  const filtered = search.trim() !== "" || collection !== ALL;

  return (
    <div className="space-y-[13px] font-prism">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <SearchWell
          label="Search themes"
          placeholder="Name or description"
          value={search}
          onChange={setSearch}
          className="md:w-[377px]"
        />
        <div className="space-y-2 md:w-[233px]">
          <p id="themes-collection" className="text-prism-label font-semibold text-prism-ink">
            Collection
          </p>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger aria-labelledby="themes-collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All collections</SelectItem>
              {categories.data?.map(category => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-prism-meta tabular-nums text-prism-ink-2 md:pb-3">
          {pagination ? `${formatCount(pagination.total)} themes` : ""}
        </p>
        <Button asChild size="lg" className="md:ml-auto">
          <Link to="/themes/new">
            <Plus aria-hidden />
            New theme
          </Link>
        </Button>
      </div>

      {themes.isError && !themes.data ? (
        <ErrorCard
          title="Themes did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void themes.refetch()}
        />
      ) : themes.isPending ? (
        <div aria-busy className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} delayMs={400} className="h-[330px] !rounded-prism-21" />
          ))}
        </div>
      ) : list.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No themes match these filters"
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setCollection(ALL);
                }}
              >
                Show all
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Palette}
            title="No themes yet"
            description="Themes you publish appear in the gallery for every creator."
            action={
              <Button asChild>
                <Link to="/themes/new">New theme</Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {list.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onEdit={() => {
                setMissing([]);
                setEditing({
                  id: theme.id,
                  name: theme.name ?? "",
                  description: theme.description,
                });
              }}
              onDelete={() => setDeleting(theme)}
            />
          ))}
        </div>
      )}

      {pagination && pagination.total > 0 && (
        <div className="prism-slab overflow-hidden">
          <SlabPager
            page={page}
            pages={pagination.pages}
            total={pagination.total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            noun="Themes"
          />
        </div>
      )}

      <EditThemeDialog
        theme={editing}
        missing={missing}
        onClose={() => {
          setEditing(null);
          setMissing([]);
        }}
        onSuccess={() => void themes.refetch()}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={open => !open && setDeleting(null)}
        title={`Delete ${deleting?.name || "this theme"}?`}
        body="This removes the theme from the gallery and cannot be undone."
        confirmLabel="Delete theme"
        destructive
        busy={deleteTheme.isPending}
        onConfirm={() => deleting && deleteTheme.mutate(deleting.id)}
      />
    </div>
  );
}

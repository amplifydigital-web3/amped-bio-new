import { useRef, useState } from "react";
import { Image as ImageIcon, ImageUp, Layers, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  trpc,
  trpcClient,
} from "@repo/ui";
import { ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES } from "@repo/constants";
import { retryToast, Spinner, undoToast } from "../../kit/parts";
import { SlabSkeletonRows, rowClass, stickyCell, tdClass, thClass } from "../../kit/Slab";
import { formatCount } from "../../kit/format";
import { EditCollectionDialog, type EditableCollection } from "./EditCollectionDialog";
import { NewCollectionDialog } from "./NewCollectionDialog";
import { uploadCollectionImage, validateImageFile } from "./uploads";

// Screen Review 088 I07, I08, I13. Collections as a G2 slab, rows 55: 34
// thumbnail, title, identifier, a labeled Visible in gallery checkbox that
// applies at once with Undo, Edit, and an overflow with Change image.

export function CollectionsTab() {
  const categories = useQuery(trpc.admin.themes.getThemeCategories.queryOptions());
  const limits = useQuery(trpc.admin.upload.getLimits.queryOptions());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableCollection | null>(null);
  const [visibleOverride, setVisibleOverride] = useState<Record<number, boolean>>({});
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<{ id: number; title: string } | null>(null);

  const refetch = () => {
    void categories.refetch().then(() => setVisibleOverride({}));
  };

  const setVisible = async (id: number, title: string, visible: boolean, fromUndo = false) => {
    setVisibleOverride(o => ({ ...o, [id]: visible }));
    try {
      await trpcClient.admin.themes.toggleThemeCategoryVisibility.mutate({ id, visible });
      if (!fromUndo) {
        undoToast(
          visible ? `${title} is visible` : "Collection hidden",
          () => void setVisible(id, title, !visible, true)
        );
      }
      refetch();
    } catch {
      setVisibleOverride(o => ({ ...o, [id]: !visible }));
      retryToast(`${title} did not update`, () => void setVisible(id, title, visible, fromUndo));
    }
  };

  const onImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = imageTarget.current;
    if (!file || !target) return;
    const problem = validateImageFile(file, limits.data);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploadingId(target.id);
    try {
      await uploadCollectionImage(target.id, file);
      toast.success(`Image changed for ${target.title}`);
      refetch();
    } catch {
      retryToast(`The image for ${target.title} did not upload`, () => {
        imageTarget.current = target;
        imageRef.current?.click();
      });
    } finally {
      setUploadingId(null);
    }
  };

  const list = categories.data ?? [];

  return (
    <div className="space-y-[13px] font-prism">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-prism-meta tabular-nums text-prism-ink-2">
          {categories.data ? `${formatCount(list.length)} collections` : ""}
        </p>
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          New collection
        </Button>
      </div>

      {categories.isError ? (
        <ErrorCard
          title="Collections did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void categories.refetch()}
        />
      ) : !categories.isPending && list.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No collections yet"
          description="Collections group themes in the gallery."
          action={<Button onClick={() => setCreating(true)}>New collection</Button>}
        />
      ) : (
        <div className="prism-slab overflow-hidden">
          <div className="overflow-x-auto">
            <table aria-label="Collections" className="w-full min-w-[720px] text-left">
              <thead>
                <tr>
                  <th scope="col" className={`${thClass} ${stickyCell}`}>
                    Collection
                  </th>
                  <th scope="col" className={thClass}>
                    Identifier
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Themes
                  </th>
                  <th scope="col" className={thClass}>
                    Gallery
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Actions
                  </th>
                </tr>
              </thead>
              {categories.isPending ? (
                <SlabSkeletonRows columns={5} />
              ) : (
                <tbody>
                  {list.map(category => {
                    const visible = visibleOverride[category.id] ?? category.visible;
                    return (
                      <tr key={category.id} className={rowClass}>
                        <td className={`${tdClass} ${stickyCell}`}>
                          <div className="flex items-center gap-3">
                            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-prism-8 bg-white/70">
                              {uploadingId === category.id ? (
                                <Spinner />
                              ) : category.image ? (
                                <img
                                  src={category.image}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageIcon aria-hidden className="h-5 w-5 text-prism-ink-3" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-prism-label font-semibold text-prism-ink">
                                {category.title}
                              </p>
                              {category.description && (
                                <p className="max-w-[377px] truncate text-prism-meta text-prism-ink-2">
                                  {category.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          className={`${tdClass} font-prism-mono text-prism-code-sm text-prism-ink-2`}
                        >
                          {category.category}
                        </td>
                        <td className={`${tdClass} text-right text-prism-label tabular-nums`}>
                          {formatCount(category._count?.themes ?? 0)}
                        </td>
                        <td className={tdClass}>
                          <Checkbox
                            checked={visible}
                            onCheckedChange={next =>
                              void setVisible(category.id, category.title, next)
                            }
                            ariaLabel={`${category.title} visible in gallery`}
                          >
                            <span className="text-prism-label">Visible in gallery</span>
                          </Checkbox>
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-right`}>
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Edit ${category.title}`}
                              onClick={() =>
                                setEditing({
                                  id: category.id,
                                  title: category.title,
                                  description: category.description,
                                })
                              }
                              className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
                            >
                              <Pencil aria-hidden className="h-5 w-5" strokeWidth={1.5} />
                            </button>
                            <Menu>
                              <MenuTrigger
                                aria-label={`More actions for ${category.title}`}
                                className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
                              >
                                <MoreHorizontal aria-hidden className="h-5 w-5" />
                              </MenuTrigger>
                              <MenuContent align="end">
                                <MenuItem
                                  onSelect={() => {
                                    imageTarget.current = {
                                      id: category.id,
                                      title: category.title,
                                    };
                                    imageRef.current?.click();
                                  }}
                                >
                                  <ImageUp aria-hidden />
                                  Change image
                                </MenuItem>
                              </MenuContent>
                            </Menu>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      <input
        ref={imageRef}
        type="file"
        className="hidden"
        accept={ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES.join(",")}
        onChange={event => void onImage(event)}
      />
      <NewCollectionDialog open={creating} onOpenChange={setCreating} onCreated={refetch} />
      <EditCollectionDialog
        collection={editing}
        onClose={() => setEditing(null)}
        onSuccess={refetch}
      />
    </div>
  );
}

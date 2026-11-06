/**
 * The item menu (Build Board #26, FL-3, spec 3.5, board m10): Play next, Add to
 * queue, Save, Mark as watched, Go to the creator's section, Remove from
 * Continue. Download joins in FL-5. The more button is the visible twin of the
 * long press, so every action has a button.
 */
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router";
import type { LibraryItem } from "@repo/constants";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  queryClient,
  trpc,
  useOptionalPlayer,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { isPlayable, ownerName, queueEntryFor } from "./parts";

const C = LIBRARY_COPY;

/** Every Library list reads again after a change, so saved marks and Continue agree. */
export function refreshLibrary() {
  return queryClient.invalidateQueries({ queryKey: trpc.library.pathKey() });
}

/** Save, unsave, mark watched and remove from Continue, with their toasts. */
export function useLibraryActions() {
  const save = useMutation(trpc.library.save.mutationOptions());
  const unsave = useMutation(trpc.library.unsave.mutationOptions());
  const markWatched = useMutation(trpc.library.markWatched.mutationOptions());
  const removeFromContinue = useMutation(trpc.library.removeFromContinue.mutationOptions());

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.add({ type: "success", title: done });
      void refreshLibrary();
      return true;
    } catch {
      toast.add({ type: "error", title: C.toasts.failed });
      return false;
    }
  };

  return {
    toggleSave: (publicId: string, saved: boolean) =>
      saved
        ? run(() => unsave.mutateAsync({ publicId }), C.toasts.unsaved)
        : run(() => save.mutateAsync({ publicId }), C.toasts.saved),
    markWatched: (publicId: string) =>
      run(() => markWatched.mutateAsync({ publicId }), C.toasts.watched),
    removeFromContinue: (publicId: string) =>
      run(() => removeFromContinue.mutateAsync({ publicId }), C.toasts.removed),
  };
}

export function ItemMenu({
  item,
  inContinue = false,
  inCreatorSection = false,
}: {
  item: LibraryItem;
  /** Offers Remove from Continue */
  inContinue?: boolean;
  /** Hides Go to the creator's section when already there */
  inCreatorSection?: boolean;
}) {
  const player = useOptionalPlayer();
  const navigate = useNavigate();
  const actions = useLibraryActions();
  const playable = isPlayable(item) && !!player;
  const saved = !!item.savedAt;

  const queue = (mode: "next" | "end") => {
    const entry = queueEntryFor(item);
    if (!player || !entry) return;
    const ok = mode === "next" ? player.playNext(entry) : player.addToQueue(entry);
    toast.add(
      ok
        ? { type: "success", title: mode === "next" ? C.toasts.playNext : C.toasts.queued }
        : { type: "error", title: C.toasts.notQueued }
    );
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label={C.menu.label(item.title)}
        className="prism-icon-btn prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-full"
      >
        <MoreHorizontal aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
      </MenuTrigger>
      <MenuContent align="end">
        {playable && (
          <>
            <MenuItem onSelect={() => queue("next")}>{C.menu.playNext}</MenuItem>
            <MenuItem onSelect={() => queue("end")}>{C.menu.addToQueue}</MenuItem>
          </>
        )}
        <MenuItem onSelect={() => void actions.toggleSave(item.publicId, saved)}>
          {saved ? C.menu.unsave : C.menu.save}
        </MenuItem>
        {playable && (
          <MenuItem onSelect={() => void actions.markWatched(item.publicId)}>
            {C.menu.markWatched}
          </MenuItem>
        )}
        {!inCreatorSection && (
          <MenuItem onSelect={() => navigate(LIBRARY_PATHS.creator(item.owner.handle))}>
            {C.menu.goToCreator(ownerName(item.owner))}
          </MenuItem>
        )}
        {inContinue && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => void actions.removeFromContinue(item.publicId)}>
              {C.menu.removeFromContinue}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

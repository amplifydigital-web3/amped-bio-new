import { useCallback, useRef, useState } from "react";
import type { ThemeConfig } from "@repo/constants";
import { trpcClient } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import type { Theme } from "@/types/editor";

/**
 * The look an editor apply writes to (TE-4a): the creator's own look the
 * editor holds, or none for a marketplace theme or a page with no look yet
 * (the server then uses the applied look, or creates the first one).
 */
export function ownLookId(theme: Pick<Theme, "id" | "user_id">): number | undefined {
  return theme.user_id !== null && theme.user_id !== undefined && theme.id > 0
    ? theme.id
    : undefined;
}

/**
 * Theme level actions for Design (Screen Review 027 I09, 031 I03, 033 I03).
 * Every action goes through the server first, then refetches the editor, so
 * the editor never shows a theme the server did not store.
 */
export function useThemeActions() {
  const { theme, profile, setUser, flushSave } = useEditor();
  const [pending, setPending] = useState(false);
  // Undo runs from a toast up to 8 s later; read the profile at that moment, not
  // the one from when the toast was created, so a bio edited meanwhile is kept.
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const refetch = useCallback(async () => {
    if (profile.handle) await setUser(profile.handle);
  }, [profile.handle, setUser]);

  /**
   * Store pending edits before a server side theme change. The refetch that follows
   * replaces the editor state with the server's, so an edit still waiting for
   * autosave would be lost; flushing it afterwards would instead write the old
   * theme back over the one just applied.
   */
  const ensureSaved = useCallback(async () => {
    if (!(await flushSave())) {
      throw new Error("Your latest changes are not saved yet. Try again.");
    }
  }, [flushSave]);

  // The look the editor holds, read at call time like the profile above
  const themeRef = useRef(theme);
  themeRef.current = theme;

  /**
   * Store a config as the creator's own editable theme (themeId 0 path). TE-4a:
   * it writes to the look the editor holds, never to whichever row the server
   * found first.
   */
  const storeOwnTheme = useCallback(
    async (name: string, config: ThemeConfig, description?: string) => {
      const lookId = ownLookId(themeRef.current);
      await trpcClient.theme.applyTheme.mutate({
        themeId: 0,
        theme: {
          name,
          description: description ?? "",
          share_level: "private",
          share_config: {},
          config,
        },
        ...(lookId ? { lookId } : {}),
      });
    },
    []
  );

  /** 027 I09: keep the look, make it editable. */
  const makeEditableCopy = useCallback(async () => {
    setPending(true);
    try {
      await ensureSaved();
      await storeOwnTheme(theme.name || "My theme", theme.config);
      await refetch();
    } finally {
      setPending(false);
    }
  }, [ensureSaved, refetch, storeOwnTheme, theme.config, theme.name]);

  /**
   * Put a previous theme back (the Undo after apply or import). `ownRowReplaced`
   * is true when the apply wrote over the creator's own theme row.
   */
  const restoreTheme = useCallback(
    async (previous: Theme, ownRowReplaced: boolean) => {
      await ensureSaved();
      const profile = profileRef.current;
      if (previous.user_id === null && previous.id > 0) {
        await trpcClient.theme.applyTheme.mutate({ themeId: previous.id });
      } else if (ownRowReplaced || previous.id <= 0) {
        await storeOwnTheme(previous.name || "My theme", previous.config);
      } else {
        await trpcClient.user.edit.mutate({
          name: profile.name,
          description: profile.bio,
          image: profile.photoUrl || "",
          reward_business_id: "",
          theme: previous.id,
        });
      }
      await refetch();
    },
    [ensureSaved, refetch, storeOwnTheme]
  );

  return { makeEditableCopy, restoreTheme, storeOwnTheme, refetch, ensureSaved, pending };
}

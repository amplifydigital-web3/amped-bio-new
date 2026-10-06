"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { trpcClient } from "@/lib/trpc";

export type FollowStatus = Awaited<ReturnType<typeof trpcClient.follow.status.query>>;

export type FollowToast = {
  id: number;
  type: "success" | "error" | "info";
  text: string;
  undo?: () => void;
};

const TOAST_MS = 5_000;

const campaignIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

/** The campaign of this visit, when the link carried one (Analytics campaign links set utm_id). */
function campaignFromUrl(): string | undefined {
  try {
    const raw = new URLSearchParams(window.location.search).get("utm_id");
    if (!raw) return undefined;
    return campaignIdSchema.parse(raw);
  } catch {
    return undefined;
  }
}

function errorText(error: unknown): string {
  const code = (error as { data?: { code?: string } })?.data?.code;
  const message = (error as Error)?.message;
  if (code === "FORBIDDEN" || code === "TOO_MANY_REQUESTS" || code === "BAD_REQUEST") {
    return message || "That didn't work. Try again.";
  }
  return "That didn't work. Check your connection and try again.";
}

/** Network errors and 5xx can pass on a retry; a 4xx answer is final. */
function isTransient(error: unknown): boolean {
  const httpStatus = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;
  return httpStatus === undefined || httpStatus >= 500;
}

/**
 * Fan Graph (#22) state for one creator page: the public count, the viewer's
 * follow, the first-follow sheet, and toasts. Signed out visitors are sent to
 * the fan sign up card, which returns here with ?follow=1.
 */
export function useFollow(handle: string, signedIn: boolean, authPending: boolean) {
  const [status, setStatus] = useState<FollowStatus | null>(null);
  // QA-032: the status read failed for a reason a retry can fix
  const [failed, setFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<FollowToast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFollowDone = useRef(false);
  const FOLLOW_INTENT_KEY = "amped_follow_intent";

  const showToast = useCallback((next: Omit<FollowToast, "id">) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...next, id: Date.now() });
    // Errors stay until dismissed (toast convention)
    if (next.type !== "error") toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const refresh = useCallback(async () => {
    try {
      setStatus(await trpcClient.follow.status.query({ handle }));
      setFailed(false);
    } catch (error) {
      if (isTransient(error)) {
        // Keep the last known state; with none, the page offers Try again
        setFailed(true);
      } else {
        setStatus(null);
        setFailed(false);
      }
    }
  }, [handle]);

  const retry = useCallback(async () => {
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (authPending) return;
    void refresh();
  }, [authPending, signedIn, refresh]);

  const follow = useCallback(
    async (
      options: { showPublicly?: boolean; emailUpdates?: boolean; fromDisclosure?: boolean } = {}
    ) => {
      setBusy(true);
      try {
        const result = await trpcClient.follow.follow.mutate({
          handle,
          source: "page",
          campaignId: campaignFromUrl(),
          ...options,
        });
        setSheetOpen(false);
        await refresh();
        if (result.pending) {
          showToast({
            type: "info",
            text: "Confirm your email to finish following.",
            undo: () => void unfollowRef.current?.(true),
          });
        } else {
          const name = status?.creatorName ?? "this creator";
          showToast({
            type: "success",
            text: `You follow ${name}.`,
            undo: () => void unfollowRef.current?.(true),
          });
        }
      } catch (error) {
        showToast({ type: "error", text: errorText(error) });
      } finally {
        setBusy(false);
      }
    },
    [handle, refresh, showToast, status?.creatorName]
  );

  const unfollow = useCallback(
    async (silent = false) => {
      // Capture current preferences before unfollowing so Undo can restore them
      const prevShowPublicly = status?.viewer?.showPublicly;
      const prevEmailUpdates = status?.viewer?.emailUpdates;
      setBusy(true);
      try {
        await trpcClient.follow.unfollow.mutate({ handle });
        await refresh();
        if (!silent) {
          showToast({
            type: "success",
            text: `You unfollowed ${status?.creatorName ?? "this creator"}.`,
            undo: () =>
              void follow({ showPublicly: prevShowPublicly, emailUpdates: prevEmailUpdates }),
          });
        } else {
          dismissToast();
        }
      } catch (error) {
        showToast({ type: "error", text: errorText(error) });
      } finally {
        setBusy(false);
      }
    },
    [handle, refresh, showToast, dismissToast, follow, status?.creatorName]
  );
  const unfollowRef = useRef(unfollow);
  unfollowRef.current = unfollow;

  const update = useCallback(
    async (patch: { showPublicly?: boolean; emailUpdates?: boolean }) => {
      try {
        await trpcClient.follow.update.mutate({ handle, ...patch });
        await refresh();
      } catch (error) {
        showToast({ type: "error", text: errorText(error) });
      }
    },
    [handle, refresh, showToast]
  );

  /** Follow tapped: sign up, the one-time sheet, or a one tap follow. */
  const startFollow = useCallback(() => {
    if (!signedIn) {
      // Record intent before navigating away so auto-follow only fires when
      // the flow originated from the Follow control
      try {
        sessionStorage.setItem(FOLLOW_INTENT_KEY, handle);
      } catch { /* noop */ }
      window.location.href = `/register?intent=follow&creator=${encodeURIComponent(handle)}`;
      return;
    }
    if (status?.viewer && !status.viewer.disclosureSeen) {
      setSheetOpen(true);
      return;
    }
    void follow();
  }, [signedIn, handle, status, follow]);

  // Back from sign up or sign in with ?follow=1: finish the follow once,
  // but only when a follow intent was recorded before navigating away
  useEffect(() => {
    if (autoFollowDone.current || !status?.viewer || !signedIn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("follow") !== "1") return;
    autoFollowDone.current = true;
    // QA-032: the param is used once, so a reload or a shared link never
    // follows again. Drop it whether or not this visit carried an intent.
    params.delete("follow");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
    );
    let recordedHandle: string | null = null;
    try {
      recordedHandle = sessionStorage.getItem(FOLLOW_INTENT_KEY);
    } catch { /* noop */ }
    if (recordedHandle !== handle) return;
    try {
      sessionStorage.removeItem(FOLLOW_INTENT_KEY);
    } catch { /* noop */ }
    if (!status.viewer.following) startFollow();
  }, [status, signedIn, startFollow]);

  return {
    status,
    failed,
    retry,
    busy,
    sheetOpen,
    setSheetOpen,
    toast,
    dismissToast,
    startFollow,
    follow,
    unfollow,
    update,
  };
}

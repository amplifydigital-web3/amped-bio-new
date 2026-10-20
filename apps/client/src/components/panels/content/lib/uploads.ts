/**
 * The app wide upload queue and its React hook. One queue per tab, created on
 * first use, so uploads keep going when the dialog closes or the creator moves
 * to another destination (cs2: "Closing keeps uploads going").
 */
import { useSyncExternalStore } from "react";
import { queryClient, trpc, trpcClient } from "@repo/ui";
import { browserUploadDeps } from "./browserDeps";
import { UploadQueue } from "./uploadQueue";

let queue: UploadQueue | null = null;

/** Refreshes the library, the meter and the item after an upload changes state. */
export function refreshContent(publicId?: string) {
  // pathFilter matches every list query, the infinite ones the library uses included
  void queryClient.invalidateQueries(trpc.content.list.pathFilter());
  void queryClient.invalidateQueries({ queryKey: trpc.content.getStorage.queryKey() });
  if (publicId) {
    void queryClient.invalidateQueries({ queryKey: trpc.content.get.queryKey({ publicId }) });
  }
}

export function getUploadQueue(): UploadQueue {
  if (queue) return queue;
  const created = new UploadQueue({
    deps: browserUploadDeps,
    getItem: publicId => trpcClient.content.get.query({ publicId }),
    onItemChange: publicId => refreshContent(publicId),
    createObjectUrl: file =>
      typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
    revokeObjectUrl: url => URL.revokeObjectURL(url),
  });
  if (typeof window !== "undefined") {
    window.addEventListener("offline", () => created.goOffline());
    window.addEventListener("online", () => created.goOnline());
    // Leaving the app stops the transfer; ask first while a file is sending
    window.addEventListener("beforeunload", event => {
      if (!created.busy) return;
      event.preventDefault();
      // Older browsers show the prompt only when returnValue is set
      event.returnValue = "";
    });
  }
  queue = created;
  return created;
}

export function useUploads() {
  const q = getUploadQueue();
  const entries = useSyncExternalStore(q.subscribe, q.getSnapshot, q.getSnapshot);
  return { queue: q, entries };
}

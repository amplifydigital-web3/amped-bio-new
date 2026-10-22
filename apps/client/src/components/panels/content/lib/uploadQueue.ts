/**
 * The upload queue behind the dialog (cs2, cs8). It lives outside React, so
 * closing the dialog or switching destinations keeps uploads going. One file
 * sends at a time, in the order chosen; the rest wait ("Starts after the file
 * before it"). Offline pauses the active file and online resumes it.
 *
 * After completeUpload the queue polls content.get until the server settles
 * the item (ready, in review, failed or blocked), so the row and the library
 * update without a reload.
 */
import type { ContentUploadKind } from "@repo/constants";
import { preflightFile, readVideoDuration, type StorageSnapshot } from "./files";
import { UploadTask, type UploadDeps, type UploadSnapshot } from "./uploadTask";
import type { ItemStatusInput } from "./status";

export type ServerItem = ItemStatusInput & { publicId: string; title: string; totalBytes: number };

export interface UploadEntry {
  id: string;
  name: string;
  size: number;
  kind: ContentUploadKind | null;
  /** Object URL for an image thumbnail in the row; revoked when the row goes */
  previewUrl: string | null;
  /** Refused before sending (type, size, storage, minutes) */
  rejected: string | null;
  upload: UploadSnapshot | null;
  /** The server's view once the file is sent */
  server: ServerItem | null;
}

export interface QueueOptions {
  deps: UploadDeps;
  getItem(publicId: string): Promise<ServerItem>;
  /** Called when an item is created, sent or settled, to refresh library queries */
  onItemChange?(publicId: string): void;
  pollMs?: number[];
  createObjectUrl?(file: File): string | null;
  revokeObjectUrl?(url: string): void;
  readDuration?(file: File): Promise<number | undefined>;
}

const DEFAULT_POLL_MS = [2000, 3000, 5000, 8000, 13000, 21000];
// A processing item older than this is left to the library; the server sweeps it at 2 hours
const POLL_GIVE_UP_MS = 2 * 60 * 60 * 1000;

let nextId = 0;

export class UploadQueue {
  private opts: QueueOptions;
  private entries: UploadEntry[] = [];
  private tasks = new Map<string, UploadTask>();
  private listeners = new Set<() => void>();
  private polls = new Map<string, ReturnType<typeof setTimeout>>();
  private snapshot: readonly UploadEntry[] = [];

  constructor(opts: QueueOptions) {
    this.opts = opts;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly UploadEntry[] => this.snapshot;

  private emit() {
    this.snapshot = [...this.entries];
    for (const listener of this.listeners) listener();
  }

  private update(id: string, patch: Partial<UploadEntry>) {
    this.entries = this.entries.map(e => (e.id === id ? { ...e, ...patch } : e));
    this.emit();
  }

  /** Bytes and minutes the files still in the queue will take, for the preflight. */
  private pending(exceptId?: string) {
    let bytes = 0;
    let minutes = 0;
    for (const entry of this.entries) {
      if (entry.id === exceptId || entry.rejected) continue;
      const phase = entry.upload?.phase;
      if (phase === "failed") continue;
      const settled = entry.server && entry.server.status !== "processing";
      // Minutes are counted by the server only at READY, so every video in the
      // queue that has not settled still takes its minutes here
      if (entry.kind === "video" && !settled) {
        minutes += Math.ceil((this.tasks.get(entry.id)?.durationSec ?? 60) / 60);
      }
      // Bytes are reserved at createUpload, and the storage snapshot counts them
      // once it refetches; until then the queue counts files not created yet
      if (!entry.upload?.publicId && phase !== "processing") bytes += entry.size;
    }
    return { bytes, minutes };
  }

  /** True while a file is being sent or waits to be sent. */
  get busy(): boolean {
    return this.entries.some(e => {
      const phase = e.upload?.phase;
      return (
        phase === "waiting" ||
        phase === "preparing" ||
        phase === "uploading" ||
        phase === "finishing" ||
        phase === "offline"
      );
    });
  }

  /**
   * Checks and queues files. Refused files stay as rows with the reason and a
   * Remove action, so the creator sees why nothing was sent.
   */
  async add(files: File[], storage: StorageSnapshot): Promise<void> {
    for (const file of files) {
      const id = `u${++nextId}`;
      const isImage = /\.(jpe?g|png|webp|gif)$/i.test(file.name);
      const entry: UploadEntry = {
        id,
        name: file.name,
        size: file.size,
        kind: null,
        previewUrl: isImage ? (this.opts.createObjectUrl?.(file) ?? null) : null,
        rejected: null,
        upload: null,
        server: null,
      };
      this.entries = [...this.entries, entry];
      this.emit();

      const first = preflightFile(file, storage, this.pending(id));
      if (!first.ok) {
        this.update(id, { kind: first.kind, rejected: first.reason });
        continue;
      }
      let durationSec: number | undefined;
      if (first.kind === "video") {
        durationSec = await (this.opts.readDuration ?? readVideoDuration)(file);
        const second = preflightFile(file, storage, this.pending(id), durationSec);
        if (!second.ok) {
          this.update(id, { kind: second.kind, rejected: second.reason });
          continue;
        }
      }
      const task = new UploadTask(
        { file, kind: first.kind, mimeType: first.mimeType, durationSec },
        this.opts.deps,
        () => this.onTaskChange(id)
      );
      this.tasks.set(id, task);
      this.update(id, { kind: first.kind, upload: task.snapshot });
    }
    this.pump();
  }

  private onTaskChange(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    const before = this.entries.find(e => e.id === id)?.upload;
    const after = task.snapshot;
    this.update(id, { upload: after });
    if (after.publicId && before?.publicId !== after.publicId) {
      this.opts.onItemChange?.(after.publicId);
    }
    if (after.phase === "processing" && before?.phase !== "processing" && after.publicId) {
      this.opts.onItemChange?.(after.publicId);
      this.poll(id, after.publicId, 0, Date.now());
    }
    if (after.phase !== before?.phase) this.pump();
  }

  /** Starts the next waiting file when nothing is sending. */
  private pump() {
    const sending = this.entries.some(e => {
      const phase = e.upload?.phase;
      return phase === "preparing" || phase === "uploading" || phase === "finishing";
    });
    if (sending) return;
    const next = this.entries.find(e => e.upload?.phase === "waiting");
    if (!next) return;
    if (!this.opts.deps.isOnline()) return;
    void this.tasks.get(next.id)?.run();
  }

  private poll(id: string, publicId: string, attempt: number, startedAt: number) {
    const delays = this.opts.pollMs ?? DEFAULT_POLL_MS;
    const delay = delays[Math.min(attempt, delays.length - 1)]!;
    const timer = setTimeout(async () => {
      this.polls.delete(id);
      if (!this.entries.some(e => e.id === id)) return;
      try {
        const item = await this.opts.getItem(publicId);
        this.update(id, { server: item });
        if (item.status !== "processing" && item.status !== "uploading") {
          this.opts.onItemChange?.(publicId);
          return;
        }
      } catch {
        // A failed poll waits for the next one
      }
      if (Date.now() - startedAt < POLL_GIVE_UP_MS) this.poll(id, publicId, attempt + 1, startedAt);
    }, delay);
    this.polls.set(id, timer);
  }

  pause(id: string) {
    this.tasks.get(id)?.pause("paused");
  }

  resume(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    const phase = task.snapshot.phase;
    if (phase !== "paused" && phase !== "offline" && phase !== "failed") return;
    // Another file is sending: this one waits its turn
    // An offline file holds its turn too: it resumes first when the network returns
    const sending = this.entries.some(e => {
      const p = e.upload?.phase;
      return (
        e.id !== id &&
        (p === "preparing" || p === "uploading" || p === "finishing" || p === "offline")
      );
    });
    if (sending) {
      // Waits its turn; pump starts it after the current file
      task.markWaiting();
      return;
    }
    void task.run();
  }

  /** Retry after a failure: resumes where it can, starts over where it must. */
  retry(id: string) {
    this.resume(id);
  }

  /** Cancels an upload in progress and deletes it on the server, then drops the row. */
  async cancel(id: string) {
    const task = this.tasks.get(id);
    const publicId = task?.snapshot.publicId ?? null;
    this.drop(id);
    if (task) {
      await task.cancel();
      if (publicId) this.opts.onItemChange?.(publicId);
    }
    this.pump();
  }

  /** Removes a finished, refused or failed row from the dialog. */
  dismiss(id: string) {
    this.drop(id);
  }

  /** Clears rows that need nothing more (ready, in review), when the dialog closes. */
  clearSettled() {
    for (const entry of this.entries) {
      const s = entry.server;
      if (s && (s.status === "ready" || s.status === "blocked")) this.drop(entry.id, false);
    }
    this.emit();
  }

  private drop(id: string, emit = true) {
    const entry = this.entries.find(e => e.id === id);
    if (entry?.previewUrl) this.opts.revokeObjectUrl?.(entry.previewUrl);
    const timer = this.polls.get(id);
    if (timer) clearTimeout(timer);
    this.polls.delete(id);
    this.tasks.delete(id);
    this.entries = this.entries.filter(e => e.id !== id);
    if (emit) this.emit();
  }

  /** The network dropped: pause the file that is sending. */
  goOffline() {
    for (const [id, task] of this.tasks) {
      const phase = task.snapshot.phase;
      if (phase === "preparing" || phase === "uploading" || phase === "finishing") {
        task.pause("offline");
        this.onTaskChange(id);
      }
    }
  }

  /** Back online: resume what the network paused, then the waiting files. */
  goOnline() {
    const sending = this.entries.some(e => {
      const phase = e.upload?.phase;
      return phase === "preparing" || phase === "uploading" || phase === "finishing";
    });
    // One file at a time: the first offline file resumes unless another is already
    // sending; the rest go back in line
    const offline = this.entries.filter(e => e.upload?.phase === "offline");
    offline.forEach((entry, index) => {
      const task = this.tasks.get(entry.id);
      if (!task) return;
      if (index === 0 && !sending) void task.run();
      else task.markWaiting();
    });
    if (offline.length === 0) this.pump();
  }

  /** Retry now from the offline notice. */
  retryNow() {
    this.goOnline();
  }
}

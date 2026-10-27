import type { BlockType } from "@repo/constants";
import type { ThemeConfig } from "@/types/editor";

/**
 * Screen Review 081 I09. When a session ends with edits not yet stored, the
 * editor keeps them in this tab's sessionStorage before it sends the person to
 * sign in. After sign in the editor loads the profile, puts these edits back
 * and autosave stores them. Only the same account, within 12 hours.
 */
const KEY = "amped:unsaved-edits";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface UnsavedEdits {
  userId: number;
  at: number;
  profile: { name: string; bio: string; photoUrl: string };
  blocks: BlockType[];
  // Only when the theme itself had unsaved edits
  themeConfig?: ThemeConfig;
}

export function stashUnsavedEdits(edits: Omit<UnsavedEdits, "at">) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...edits, at: Date.now() }));
    return true;
  } catch {
    // Storage blocked or full: the dialog then says nothing about keeping edits
    return false;
  }
}

/** Reads and removes the kept edits for this account, if any are fresh. */
export function takeUnsavedEdits(userId: number): UnsavedEdits | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const edits = JSON.parse(raw) as UnsavedEdits;
    if (edits.userId !== userId) return null;
    sessionStorage.removeItem(KEY);
    return Date.now() - edits.at <= MAX_AGE_MS ? edits : null;
  } catch {
    return null;
  }
}

/** True for a tRPC error the server answered with 401 (the session ended). */
export function isSessionEnded(error: unknown): boolean {
  const data = (error as { data?: { httpStatus?: number; code?: string } } | null)?.data;
  return data?.httpStatus === 401 || data?.code === "UNAUTHORIZED";
}

/** The event the editor listens for to open the Your session ended dialog. */
export const SESSION_ENDED_EVENT = "amped:session-ended";

export function announceSessionEnded() {
  window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
}

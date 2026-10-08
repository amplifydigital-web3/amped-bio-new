"use client";

import { createContext, useContext } from "react";
import type { useFollow } from "./useFollow";

export type FollowState = ReturnType<typeof useFollow>;

/**
 * Follow block and Followers block (Build Board #30, spec 3.4): one `useFollow`
 * per page, owned by ProfileView and read by the capsule and the blocks, so
 * Follow in a block and Following in the menu never disagree. Null when the
 * fan graph is off for this page, when the viewer is the owner, or outside a
 * creator page.
 */
export const FollowContext = createContext<{
  state: FollowState;
  isOwner: boolean;
  enabled: boolean;
} | null>(null);

export function useFollowContext() {
  return useContext(FollowContext);
}

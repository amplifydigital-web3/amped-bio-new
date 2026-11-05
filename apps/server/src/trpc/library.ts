/**
 * Fan Library API (Build Board #26, FL-2, spec 3.6). Every procedure is
 * private, scoped to the session account, and behind the fanLibrary flag.
 * The work lives in services/library; who may list an item is
 * services/library/access.ts (public items until gating, FL-6).
 *
 * Following, for the Library's Your creators, is follow.listFollowing (Fan
 * Graph), which already returns the viewer's follows.
 */
import { TRPCError } from "@trpc/server";
import {
  LIBRARY_LIMITS,
  libraryContinueSchema,
  libraryCreatorItemsSchema,
  libraryCreatorSchema,
  libraryCreatorsSchema,
  libraryNewestSchema,
  librarySaveSchema,
  librarySavedSchema,
  librarySearchSchema,
} from "@repo/constants";
import { privateProcedure, router, type Context } from "./trpc";
import { isFeatureOn } from "../services/featureFlags";
import { hitRateLimit } from "../utils/rateLimit";
import {
  LibraryNotFound,
  libraryContinue,
  libraryCreator,
  libraryCreatorItems,
  libraryCreators,
  libraryNewest,
  librarySave,
  librarySaved,
  librarySearch,
  libraryUnsave,
} from "../services/library/library";

export const LIBRARY_MESSAGES = {
  off: "The Library is not available yet.",
  rate: "Too many requests. Try again in a minute.",
  notFound: "This item is not available.",
  creatorNotFound: "This page is not available.",
} as const;

/** The flag guard and the per account limit, before any read. Returns the viewer. */
async function begin(ctx: Context, kind: "read" | "save"): Promise<number> {
  if (!isFeatureOn("fanLibrary")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: LIBRARY_MESSAGES.off });
  }
  const viewerId = ctx.user!.sub;
  const limit = kind === "save" ? LIBRARY_LIMITS.savesPerMinute : LIBRARY_LIMITS.readsPerMinute;
  if ((await hitRateLimit(`library-${kind}:${viewerId}`, 60)) > limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: LIBRARY_MESSAGES.rate });
  }
  return viewerId;
}

export const libraryRouter = router({
  /** Continue: unfinished items, last played first (board m1). */
  continue: privateProcedure.input(libraryContinueSchema).query(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "read");
    return { items: await libraryContinue(viewerId, input?.handle) };
  }),

  /** Newest from the creators the fan follows (board m1, d1). */
  newest: privateProcedure.input(libraryNewestSchema).query(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "read");
    return libraryNewest(viewerId, input ?? {});
  }),

  /** Your creators (board m3, row 180). */
  creators: privateProcedure.input(libraryCreatorsSchema).query(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "read");
    return libraryCreators(viewerId, input ?? {});
  }),

  /** The creator section header (board m4, row 181). Records the visit. */
  creator: privateProcedure.input(libraryCreatorSchema).query(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "read");
    const header = await libraryCreator(viewerId, input.handle);
    if (!header) {
      throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.creatorNotFound });
    }
    return header;
  }),

  /** Yours or Shop in a creator section (boards m4, m5). */
  creatorItems: privateProcedure.input(libraryCreatorItemsSchema).query(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "read");
    return libraryCreatorItems(viewerId, input);
  }),

  /** Search (board m2, row 183): All creators, one creator, or On this device. */
  search: privateProcedure.input(librarySearchSchema).query(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "read");
    return librarySearch(viewerId, input);
  }),

  /** Saved (board m1, the Saved and Downloads row). */
  saved: privateProcedure.input(librarySavedSchema).query(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "read");
    return librarySaved(viewerId, input?.cursor);
  }),

  save: privateProcedure.input(librarySaveSchema).mutation(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "save");
    try {
      return await librarySave(viewerId, input.publicId);
    } catch (error) {
      if (error instanceof LibraryNotFound) {
        throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.notFound });
      }
      throw error;
    }
  }),

  unsave: privateProcedure.input(librarySaveSchema).mutation(async ({ ctx, input }) => {
    const viewerId = await begin(ctx, "save");
    return libraryUnsave(viewerId, input.publicId);
  }),
});

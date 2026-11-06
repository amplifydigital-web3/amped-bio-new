/**
 * Fan Library API (Build Board #26, FL-2, spec 3.6). Every procedure is
 * private, scoped to the session account, and behind the fanLibrary flag.
 * The work lives in services/library; who may list an item is
 * services/library/access.ts (public items, and gated items through the
 * gating engine while accessGating is on, FL-6).
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
  libraryDownloadsCheckSchema,
  libraryDownloadsSchema,
  libraryMarkDownloadedSchema,
  libraryRecordDownloadSchema,
  libraryRemoveDownloadSchema,
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
  libraryMarkWatched,
  libraryNewest,
  libraryRemoveFromContinue,
  librarySave,
  librarySaved,
  librarySearch,
  libraryUnsave,
} from "../services/library/library";
import {
  DownloadRefused,
  checkDownloads,
  listDownloads,
  markDownloaded,
  recordDownload,
  removeDownload,
} from "../services/library/downloads";
import type { LibraryViewer } from "../services/library/access";
import {
  libraryCreatorMoney,
  libraryMembership,
  libraryMemberships,
} from "../services/library/money";
import { prisma } from "@repo/database";
import { z } from "zod";

export const LIBRARY_MESSAGES = {
  off: "The Library is not available yet.",
  rate: "Too many requests. Try again in a minute.",
  notFound: "This item is not available.",
  creatorNotFound: "This page is not available.",
  downloadsOff: "The creator does not allow downloads for this item.",
  downloadNotReady: "This item is not ready to download yet. Try again later.",
  downloadCap: "You reached today's downloads for this item. Try again tomorrow.",
  unknownDownload: "This download is not on this device.",
} as const;

/** FL-5: a refused download as the error the app shows. */
function downloadError(error: unknown): never {
  if (error instanceof DownloadRefused) {
    switch (error.reason) {
      case "downloadsOff":
        throw new TRPCError({ code: "FORBIDDEN", message: LIBRARY_MESSAGES.downloadsOff });
      case "notReady":
        throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.downloadNotReady });
      case "cap":
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: LIBRARY_MESSAGES.downloadCap });
      case "unknownRecord":
        throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.unknownDownload });
      default:
        throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.notFound });
    }
  }
  throw error;
}

/**
 * The flag guard and the per account limit, before any read. Returns the
 * viewer the gating engine reads: the session account and its wallet, never
 * client input.
 */
async function begin(ctx: Context, kind: "read" | "save"): Promise<LibraryViewer> {
  if (!isFeatureOn("fanLibrary")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: LIBRARY_MESSAGES.off });
  }
  const viewerId = ctx.user!.sub;
  const limit = kind === "save" ? LIBRARY_LIMITS.savesPerMinute : LIBRARY_LIMITS.readsPerMinute;
  if ((await hitRateLimit(`library-${kind}:${viewerId}`, 60)) > limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: LIBRARY_MESSAGES.rate });
  }
  return { userId: viewerId, wallet: ctx.user!.wallet ?? null };
}

export const libraryRouter = router({
  /** Continue: unfinished items, last played first (board m1). */
  continue: privateProcedure.input(libraryContinueSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    return { items: await libraryContinue(viewer, input?.handle) };
  }),

  /** Newest from the creators the fan follows (board m1, d1). */
  newest: privateProcedure.input(libraryNewestSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    return libraryNewest(viewer, input ?? {});
  }),

  /** Your creators (board m3, row 180). */
  creators: privateProcedure.input(libraryCreatorsSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    return libraryCreators(viewer, input ?? {});
  }),

  /** The creator section header (board m4, row 181). Records the visit. */
  creator: privateProcedure.input(libraryCreatorSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    const header = await libraryCreator(viewer, input.handle);
    if (!header) {
      throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.creatorNotFound });
    }
    return header;
  }),

  /** Yours or Shop in a creator section (boards m4, m5). */
  creatorItems: privateProcedure.input(libraryCreatorItemsSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    return libraryCreatorItems(viewer, input);
  }),

  /** Search (board m2, row 183): All creators, one creator, or On this device. */
  search: privateProcedure.input(librarySearchSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    return librarySearch(viewer, input);
  }),

  /** Saved (board m1, the Saved and Downloads row). */
  saved: privateProcedure.input(librarySavedSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    return librarySaved(viewer, input?.cursor);
  }),

  save: privateProcedure.input(librarySaveSchema).mutation(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "save");
    try {
      return await librarySave(viewer, input.publicId);
    } catch (error) {
      if (error instanceof LibraryNotFound) {
        throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.notFound });
      }
      throw error;
    }
  }),

  unsave: privateProcedure.input(librarySaveSchema).mutation(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "save");
    return libraryUnsave(viewer.userId, input.publicId);
  }),

  /** Mark as watched (item menu, board m10, FL-3). */
  markWatched: privateProcedure.input(librarySaveSchema).mutation(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "save");
    try {
      return await libraryMarkWatched(viewer, input.publicId);
    } catch (error) {
      if (error instanceof LibraryNotFound) {
        throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.notFound });
      }
      throw error;
    }
  }),

  /** Remove from Continue (item menu, board m10, FL-3). Forgets the position. */
  removeFromContinue: privateProcedure.input(librarySaveSchema).mutation(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "save");
    return libraryRemoveFromContinue(viewer.userId, input.publicId);
  }),

  /** FL-7, MB-3: Memberships (row 125, boards r1, mb-q1): every card, most urgent first. */
  memberships: privateProcedure.query(async ({ ctx }) => {
    const viewer = await begin(ctx, "read");
    return { items: await libraryMemberships(viewer.userId) };
  }),

  /** FL-7: one membership with its receipts, for the Manage sheet. */
  membership: privateProcedure
    .input(z.object({ id: z.string().regex(/^[0-9a-f]{32}$/) }))
    .query(async ({ ctx, input }) => {
      const viewer = await begin(ctx, "read");
      const found = await libraryMembership(viewer.userId, input.id);
      if (!found) throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.notFound });
      return found;
    }),

  /** FL-7: the status sheet's membership, receipts and purchases from one creator (row 182). */
  creatorMoney: privateProcedure.input(libraryCreatorSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    const creator = await prisma.user.findFirst({
      where: { handle: input.handle.toLowerCase() },
      select: { id: true },
    });
    if (!creator || creator.id === viewer.userId) {
      throw new TRPCError({ code: "NOT_FOUND", message: LIBRARY_MESSAGES.creatorNotFound });
    }
    return libraryCreatorMoney(viewer.userId, creator.id);
  }),

  // ------------------------------------------------------------ FL-5 downloads

  /** The copies this installed app keeps (board m10). */
  downloads: privateProcedure.input(libraryDownloadsSchema).query(async ({ ctx, input }) => {
    const viewer = await begin(ctx, "read");
    return listDownloads(viewer, input.device);
  }),

  /** Starts a download: the record and a single use file link (decision C). */
  recordDownload: privateProcedure
    .input(libraryRecordDownloadSchema)
    .mutation(async ({ ctx, input }) => {
      const viewer = await begin(ctx, "save");
      try {
        return await recordDownload(viewer, input.publicId, input.device);
      } catch (error) {
        downloadError(error);
      }
    }),

  /** The app saved the file; the size feeds the storage line. */
  markDownloaded: privateProcedure
    .input(libraryMarkDownloadedSchema)
    .mutation(async ({ ctx, input }) => {
      const viewer = await begin(ctx, "save");
      try {
        return await markDownloaded(viewer.userId, input.id, input.bytes);
      } catch (error) {
        downloadError(error);
      }
    }),

  /** The fan removed a copy (swipe, Remove, Clear all). */
  removeDownload: privateProcedure
    .input(libraryRemoveDownloadSchema)
    .mutation(async ({ ctx, input }) => {
      const viewer = await begin(ctx, "save");
      try {
        return await removeDownload(viewer.userId, input.id);
      } catch (error) {
        downloadError(error);
      }
    }),

  /**
   * The sync check (spec 3.5): which copies the fan may still open. A mutation,
   * because it closes the records it finds the fan may no longer keep.
   */
  downloadsCheck: privateProcedure
    .input(libraryDownloadsCheckSchema)
    .mutation(async ({ ctx, input }) => {
      const viewer = await begin(ctx, "read");
      return checkDownloads(viewer, input.device, input.ids);
    }),
});

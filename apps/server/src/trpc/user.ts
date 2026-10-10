import { privateProcedure, publicProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sendEmailChangeNotice, sendEmailChangeVerification } from "../utils/email/email";
import crypto from "crypto";
import { prisma } from "../services/DB";
import { editUserSchema, setRnsNameSchema } from "../schemas/user.schema";
import Decimal from "decimal.js";
import { htmlToPlainText, sanitizeRichText } from "@repo/constants";
import { parseRnsInput, RNS_CHAIN } from "@repo/web3";
import { assertRnsBinding } from "../services/rns";
import { rnsDisplaySchema } from "../services/rnsIdentity";
import { newHandleSchema } from "../services/pageHandle";
import { publishPage, unpublishPage } from "../services/pagePublish";
import { getFileUrl } from "../utils/fileUrlResolver";
import { publicCount } from "../services/follow/rules";
import { batchPoolFanCreatorIds } from "../services/follow/poolFans";
import { computeRnsIdentity, parseRnsDisplay } from "../services/rnsIdentity";
import type { Background, ThemeConfig } from "@repo/constants";

// Schema for initiating email change
const initiateEmailChangeSchema = z.object({
  currentEmail: z.string().email({ message: "Invalid current email address format" }),
  newEmail: z.string().email({ message: "Invalid new email address format" }),
});

// Schema for resending email verification
const resendEmailVerificationSchema = z.object({
  currentEmail: z.string().email({ message: "Invalid current email address format" }),
  newEmail: z.string().email({ message: "Invalid new email address format" }),
});

// Schema for confirming email change
const confirmEmailChangeSchema = z.object({
  code: z.string().length(6, { message: "Verification code must be 6 digits" }),
  newEmail: z.string().email({ message: "Invalid email address format" }),
});

// Function to generate a random 6-digit code
const generateSixDigitCode = (): string => {
  return crypto.randomInt(100000, 1000000).toString().padStart(6, "0");
};

/**
 * Explore, Users: one person card (Screen Review 042, Explore person cards
 * build). Everything here is public page data or a count the creator already
 * shows on their page. Never an email, wallet, campaign or stake amount.
 */
type Person = {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  /** Month the account was created, as an ISO date. The day is not shown. */
  joinedAt: string;
  /** The creator's page background, for the card cover. null falls back to the room. */
  cover: { kind: "color"; css: string } | { kind: "image"; url: string } | null;
  /** RNS chip as the public page shows it (109 I01). name is absent when the owner hides it. */
  rns: { chip: "verified" | "name"; name?: string } | null;
  /** Public follower count under the capsule rules: null under 10 or when hidden. */
  followerCount: number | null;
  showCount: boolean;
  newOnAmped: boolean;
  /** Visible link and media blocks */
  linkCount: number;
  mediaCount: number;
  /** Platform ids from link and media blocks, deduplicated, page order. Known platforms only. */
  platforms: string[];
  /** The creator's visible pool, if one exists on chain */
  pool: { name: string; fans: number; image: string | null } | null;
  /** The signed in viewer's relationship. null when signed out. */
  viewer: {
    isOwner: boolean;
    following: boolean;
    poolFan: boolean;
    /** False until the first-follow sheet has been accepted once (decision 3) */
    disclosureSeen: boolean;
  } | null;
};

/** Follows that count toward the public number: verified email, not suspended (follow.ts) */
const COUNTED_FOLLOWER = { email_verified: true, block: "no" } as const;

/** Platforms that never show as a mark on the card */
const UNMARKED_PLATFORMS = new Set([
  "custom",
  "email",
  "document",
  "token-price",
  "nft-collection",
  "creator-pool",
]);

/** The RNS reads are cached per name, but a cold page must not wait on the chain. */
const RNS_READ_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/** The card cover from a theme background. Video backgrounds use their thumbnail. */
async function coverFrom(background: Background | undefined): Promise<Person["cover"]> {
  if (!background) return null;
  if (background.type === "color") {
    return background.value ? { kind: "color", css: background.value } : null;
  }
  if (background.thumbnail) return { kind: "image", url: background.thumbnail };
  if (background.fileId) {
    const url = await getFileUrl({ legacyImageField: null, imageFileId: background.fileId }).catch(
      () => null
    );
    return url ? { kind: "image", url } : null;
  }
  if (background.type === "image" && background.value) {
    return { kind: "image", url: background.value };
  }
  return null;
}

export const userRouter = router({
  // Edit user profile
  edit: privateProcedure.input(editUserSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    console.group("🔄 User Edit Operation (tRPC)");
    console.info("📝 Starting user edit process");
    console.info(`👤 User ID: ${userId}`);

    const { name, description, theme, image, reward_business_id } = input;
    console.info(
      `📋 Edit data: ${JSON.stringify({ name, description, theme, image, reward_business_id })}`
    );

    try {
      console.info("💾 Updating user information");
      await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          // Bio HTML is stored only after the shared allowlist sanitizer runs
          description: sanitizeRichText(description),
          theme: `${theme}`,
          image,
          reward_business_id,
        },
      });
      console.info("✅ User updated successfully");

      console.groupEnd();
      return {
        message: "User updated successfully",
      };
    } catch (error) {
      console.error("❌ Error:", error);
      console.groupEnd();
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Screen Review 108 I01: the RNS name has its own write. A name is stored
  // only while it is bound to the account wallet (UserWallet): the
  // registration has not expired (no grace), the BaseRegistrar owner and the
  // resolver addr are the wallet. Any failed read refuses the write. Only the
  // label is stored. null clears it.
  setRnsName: privateProcedure.input(setRnsNameSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    if (input.label === null) {
      await prisma.user.update({ where: { id: userId }, data: { revo_name: null } });
      return { label: null };
    }
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { wallet: { select: { address: true } } },
    });
    await assertRnsBinding(input.label, account?.wallet?.address ?? null);
    const label = parseRnsInput(input.label, RNS_CHAIN.id);
    await prisma.user.update({ where: { id: userId }, data: { revo_name: label } });
    return { label };
  }),

  // Screen Review 108 I04: what the public page shows. getHandle applies it on
  // the server, so a hidden field never reaches a visitor.
  setRnsDisplay: privateProcedure.input(rnsDisplaySchema).mutation(async ({ ctx, input }) => {
    await prisma.user.update({ where: { id: ctx.user!.sub }, data: { rns_display: input } });
    return input;
  }),

  // QA-008: the owner publishes their page, optionally with a new URL checked
  // like Account, Public URL. Publishing a live page again is a no-op.
  publishPage: privateProcedure
    .input(z.object({ handle: newHandleSchema.optional() }).optional())
    .mutation(({ ctx, input }) => publishPage(ctx.user!.sub, input?.handle)),

  // QA-008: the page reads as not found again. Followers stay.
  unpublishPage: privateProcedure.mutation(({ ctx }) => unpublishPage(ctx.user!.sub)),

  // Initiate email change by requesting a verification code
  initiateEmailChange: privateProcedure
    .input(initiateEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;

      try {
        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Verify that the current email matches the user's actual email
        if (user.email !== input.currentEmail) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Current email does not match your account email",
          });
        }

        // Check if the new email is already in use
        const existingEmailUser = await prisma.user.findUnique({
          where: { email: input.newEmail },
        });

        if (existingEmailUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email address is already in use",
          });
        }

        // Check if the user has requested a code within the last minute
        const latestCode = await prisma.confirmationCode.findFirst({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            createdAt: {
              gt: new Date(Date.now() - 60000), // 1 minute ago
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (latestCode) {
          // Calculate when the user can retry (1 minute after last request)
          const retryAfter = new Date(latestCode.createdAt);
          retryAfter.setMinutes(retryAfter.getMinutes() + 1);

          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Please wait before requesting a new verification code",
            cause: {
              code: "RATE_LIMIT_EMAIL_VERIFICATION",
              retryAfter: retryAfter.toISOString(),
            },
          });
        }

        // Generate a 6-digit code
        const code = generateSixDigitCode();

        // Set expiration (5 minutes from now)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 5);

        // Delete any existing EMAIL_CHANGE codes for this user
        await prisma.confirmationCode.deleteMany({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            used: false,
          },
        });

        // Create a new confirmation code, bound to the address it is sent to
        await prisma.confirmationCode.create({
          data: {
            code,
            type: "EMAIL_CHANGE",
            userId,
            target: input.newEmail,
            expiresAt,
          },
        });

        // Screen Review 019 I02: the code goes to the new address, which proves
        // the person controls it. The current address gets a notice.
        await sendEmailChangeVerification(input.newEmail, code);
        await sendEmailChangeNotice(user.email, input.newEmail);

        return {
          success: true,
          message: "Verification code sent to your new email",
          expiresAt,
        };
      } catch (error: any) {
        console.error("Error initiating email change:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to initiate email change",
        });
      }
    }),

  // Confirm email change with verification code
  confirmEmailChange: privateProcedure
    .input(confirmEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;

      try {
        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Cleanup expired confirmation codes
        try {
          await prisma.confirmationCode.deleteMany({
            where: {
              type: "EMAIL_CHANGE",
              expiresAt: {
                lt: new Date(),
              },
            },
          });
        } catch (cleanupError) {
          // Ignore errors during cleanup
          console.warn("Error cleaning up expired confirmation codes:", cleanupError);
        }

        // Verify the confirmation code
        const confirmationCode = await prisma.confirmationCode.findFirst({
          where: {
            userId,
            code: input.code,
            type: "EMAIL_CHANGE",
            // Only the address the code was sent to can be confirmed (019 I02)
            target: input.newEmail,
            used: false,
            expiresAt: {
              gt: new Date(),
            },
          },
        });

        if (!confirmationCode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired verification code",
          });
        }

        // Check that the new email provided in the confirmation matches what was requested
        const newEmail = input.newEmail;

        // Check if the email is still available
        const existingEmailUser = await prisma.user.findUnique({
          where: { email: newEmail },
        });

        if (existingEmailUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email address is already in use",
          });
        }

        // Update the user's email
        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            email: newEmail,
            updated_at: new Date(),
          },
        });

        // Mark the confirmation code as used
        await prisma.confirmationCode.update({
          where: { id: confirmationCode.id },
          data: { used: true },
        });

        return {
          success: true,
          message: "Email address has been successfully updated",
        };
      } catch (error: any) {
        console.error("Error confirming email change:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update email address",
        });
      }
    }),

  // Resend the email change code to the address of the pending request
  resendEmailVerification: privateProcedure
    .input(resendEmailVerificationSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;

      try {
        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Verify that the current email matches the user's actual email
        if (user.email !== input.currentEmail) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Current email does not match your account email",
          });
        }

        // Check if the new email is already in use
        const existingEmailUser = await prisma.user.findUnique({
          where: { email: input.newEmail },
        });

        if (existingEmailUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email address is already in use",
          });
        }

        // Check if the user has requested a code within the last minute
        const latestCode = await prisma.confirmationCode.findFirst({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            createdAt: {
              gt: new Date(Date.now() - 60000), // 1 minute ago
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (latestCode) {
          // Calculate when the user can retry (1 minute after last request)
          const retryAfter = new Date(latestCode.createdAt);
          retryAfter.setMinutes(retryAfter.getMinutes() + 1);

          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Please wait before requesting a new verification code",
            cause: {
              code: "RATE_LIMIT_EMAIL_VERIFICATION",
              retryAfter: retryAfter.toISOString(),
            },
          });
        }

        // Resend only to the address of a pending request. initiateEmailChange
        // is the path that notifies the current address, so a resend must not
        // start a change to a new address (019 I02)
        const pendingCode = await prisma.confirmationCode.findFirst({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            target: input.newEmail,
            used: false,
          },
        });

        if (!pendingCode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pending email change for this address. Start the change again.",
          });
        }

        // Generate a 6-digit code
        const code = generateSixDigitCode();

        // Set expiration (5 minutes from now)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 5);

        // The new code replaces the earlier ones, so only one code is valid
        await prisma.confirmationCode.deleteMany({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            used: false,
          },
        });

        await prisma.confirmationCode.create({
          data: {
            code,
            type: "EMAIL_CHANGE",
            userId,
            target: input.newEmail,
            expiresAt,
          },
        });

        // The code goes to the new address (019 I02)
        await sendEmailChangeVerification(input.newEmail, code);

        return {
          success: true,
          message: "New verification code sent to your new email",
          expiresAt,
        };
      } catch (error: any) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error("Error resending email verification:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resend email verification code",
        });
      }
    }),
  getUsers: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        filter: z.enum(["all", "active-7-days", "has-creator-pool"]).optional().default("all"),
        sort: z
          .enum(["newest", "name-asc", "name-desc", "most-followers"])
          .optional()
          .default("newest"),
        page: z.number().optional().default(1),
        limit: z.number().optional().default(20), // Default to 20 users per page, max 20
      })
    )
    .query(async ({ ctx, input }): Promise<{ users: Person[]; total: number }> => {
      // Ensure limit doesn't exceed 20
      const safeLimit = Math.min(input.limit || 20, 20);
      const safePage = Math.max(input.page || 1, 1);

      // Build the base where clause based on search. Only published, not
      // suspended pages are listed (Fan Graph #22: fan accounts have no page).
      const whereClause: any = { page_status: "PUBLISHED", block: "no" };
      // Screen Review 042 I10: match the display name or the @handle. A leading
      // @ is ignored; the MySQL collation makes contains case insensitive.
      const term = input.search?.trim().replace(/^@+/, "");
      if (term) {
        whereClause.OR = [{ name: { contains: term } }, { handle: { contains: term } }];
      }

      // Apply has-creator-pool filter
      if (input.filter === "has-creator-pool") {
        whereClause.wallet = {
          creatorPools: {
            some: {},
          },
        };
      }

      // Apply sorting at the database level
      let orderBy: any = {};
      switch (input.sort) {
        case "name-asc":
          orderBy = { name: "asc" };
          break;
        case "name-desc":
          orderBy = { name: "desc" };
          break;
        case "newest":
          orderBy = { created_at: "desc" };
          break;
        // 086 D3: a sort, never a rank. Ties and hidden counts still sort, but
        // the card shows nothing a creator chose to hide.
        case "most-followers":
          orderBy = [{ followsReceived: { _count: "desc" } }, { created_at: "desc" }];
          break;
        default:
          break;
      }

      // Get count for pagination
      const total = await prisma.user.count({ where: whereClause });

      // Get paginated users with sorting applied at DB level
      const paginatedUsers = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          handle: true,
          image: true,
          image_file_id: true,
          description: true,
          created_at: true,
          theme: true,
          revo_name: true,
          rns_display: true,
          show_follower_count: true,
          wallet: {
            select: {
              address: true,
              creatorPools: {
                where: { poolAddress: { not: null }, OR: [{ hidden: false }, { hidden: null }] },
                orderBy: { id: "desc" },
                take: 1,
                select: { name: true, fans: true, image_file_id: true },
              },
            },
          },
          blocks: {
            orderBy: { order: "asc" },
            select: { type: true, config: true },
          },
        },
        orderBy,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      });

      const ids = paginatedUsers.map(user => user.id);

      // One read per table for the whole page: themes, follower counts, the viewer's follows and stakes
      const themeIds = [
        ...new Set(
          paginatedUsers
            .map(user => Number(user.theme))
            .filter(id => Number.isInteger(id) && id > 0)
        ),
      ];
      const viewerId = ctx.user?.sub ?? null;
      const [themes, followerGroups, viewerFollows, viewerPoolFans, viewer] = await Promise.all([
        themeIds.length
          ? prisma.theme.findMany({
              where: { id: { in: themeIds } },
              select: { id: true, config: true },
            })
          : [],
        ids.length
          ? prisma.follow.groupBy({
              by: ["creator_id"],
              where: { creator_id: { in: ids }, follower: COUNTED_FOLLOWER },
              _count: { _all: true },
            })
          : [],
        viewerId && ids.length
          ? prisma.follow.findMany({
              where: { follower_id: viewerId, creator_id: { in: ids } },
              select: { creator_id: true },
            })
          : [],
        viewerId ? batchPoolFanCreatorIds(ids, viewerId) : new Set<number>(),
        viewerId
          ? prisma.user.findUnique({
              where: { id: viewerId },
              select: { follow_disclosure_seen_at: true },
            })
          : null,
      ]);
      const themeById = new Map<number, ThemeConfig | null>();
      for (const theme of themes) themeById.set(theme.id, theme.config as ThemeConfig | null);
      const followerCountById = new Map<number, number>();
      for (const group of followerGroups)
        followerCountById.set(group.creator_id, group._count._all);
      const followingIds = new Set(viewerFollows.map(row => row.creator_id));

      const users = await Promise.all(
        paginatedUsers.map(async (user): Promise<Person> => {
          const visibleBlocks = user.blocks.filter(block => {
            const config = block.config as { hidden?: boolean } | null;
            return !config?.hidden;
          });
          const platforms: string[] = [];
          for (const block of visibleBlocks) {
            if (block.type !== "link" && block.type !== "media") continue;
            const platform = (block.config as { platform?: string } | null)?.platform;
            if (!platform || UNMARKED_PLATFORMS.has(platform) || platforms.includes(platform))
              continue;
            platforms.push(platform);
          }
          const pool = user.wallet?.creatorPools[0] ?? null;
          const theme = themeById.get(Number(user.theme)) ?? null;

          const [avatar, cover, poolImage, identity] = await Promise.all([
            getFileUrl({ legacyImageField: user.image, imageFileId: user.image_file_id }).catch(
              () => null
            ),
            coverFrom(theme?.background),
            pool?.image_file_id
              ? getFileUrl({ legacyImageField: null, imageFileId: pool.image_file_id }).catch(
                  () => null
                )
              : Promise.resolve(null),
            // 109 I01: the same rule as the public page, so the card never
            // shows a name the page hides. Any doubt or delay shows no chip.
            user.revo_name
              ? withTimeout(
                  computeRnsIdentity({
                    storedName: user.revo_name,
                    wallet: user.wallet?.address ?? null,
                    display: parseRnsDisplay(user.rns_display),
                  }).then(result => result.identity),
                  RNS_READ_TIMEOUT_MS,
                  null
                )
              : Promise.resolve(null),
          ]);

          const counted = followerCountById.get(user.id) ?? 0;
          const count = publicCount(counted, user.show_follower_count);

          return {
            id: user.id.toString(),
            displayName: user.name,
            username: user.handle || "",
            avatar,
            // Explore cards show the bio as plain text; no creator HTML renders there
            bio: htmlToPlainText(user.description),
            joinedAt: user.created_at.toISOString(),
            cover,
            rns: identity ? { chip: identity.chip, name: identity.name } : null,
            followerCount: count.followerCount,
            showCount: count.showCount,
            newOnAmped: count.newOnAmped,
            linkCount: visibleBlocks.filter(block => block.type === "link").length,
            mediaCount: visibleBlocks.filter(block => block.type === "media").length,
            platforms,
            pool: pool
              ? { name: pool.name || "Creator pool", fans: pool.fans, image: poolImage }
              : null,
            viewer: viewerId
              ? {
                  isOwner: viewerId === user.id,
                  following: followingIds.has(user.id),
                  poolFan: viewerPoolFans.has(user.id),
                  disclosureSeen: !!viewer?.follow_disclosure_seen_at,
                }
              : null,
          };
        })
      );

      return { users, total };
    }),
});

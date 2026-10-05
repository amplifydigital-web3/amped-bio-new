import { TRPCError } from "@trpc/server";
import {
  CREATOR_TRACKING_TERMS_VERSION,
  trackingPixelsUpdateSchema,
  type PublicTrackingPixels,
} from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import { prisma } from "../services/DB";
import { encryptSecret } from "../services/analytics/secretBox";
import { invalidatePixelConfig } from "../services/analytics/pixelForwarding";
import { newAnalyticsId } from "../services/analytics/ids";

type TrackingPixelsRow = Awaited<ReturnType<typeof prisma.trackingPixels.findUnique>>;

function toSettings(row: TrackingPixelsRow) {
  return {
    ga4MeasurementId: row?.ga4_measurement_id ?? null,
    metaPixelId: row?.meta_pixel_id ?? null,
    tiktokPixelId: row?.tiktok_pixel_id ?? null,
    // Tokens are write-only. Clients only learn whether one is stored.
    hasMetaCapiToken: !!row?.meta_capi_token_enc,
    hasTiktokEventsToken: !!row?.tiktok_events_token_enc,
    // Screen Review 093 D2: whether the current terms version is on record
    termsAccepted: row?.terms_version === CREATOR_TRACKING_TERMS_VERSION,
  };
}

/** Public pixel IDs for a creator's page, or null when none are configured. */
export async function getPublicTrackingPixels(
  userId: number
): Promise<PublicTrackingPixels | null> {
  const row = await prisma.trackingPixels.findUnique({
    where: { user_id: userId },
    select: { ga4_measurement_id: true, meta_pixel_id: true, tiktok_pixel_id: true },
  });
  if (!row || (!row.ga4_measurement_id && !row.meta_pixel_id && !row.tiktok_pixel_id)) {
    return null;
  }
  return {
    ga4MeasurementId: row.ga4_measurement_id,
    metaPixelId: row.meta_pixel_id,
    tiktokPixelId: row.tiktok_pixel_id,
  };
}

// undefined keeps the stored value, "" or null clears it
function nextId(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value ? value : null;
}

function nextToken(value: string | undefined) {
  if (value === undefined) return undefined;
  return value ? encryptSecret(value) : null;
}

export const trackingPixelsRouter = router({
  get: privateProcedure.query(async ({ ctx }) => {
    const row = await prisma.trackingPixels.findUnique({ where: { user_id: ctx.user!.sub } });
    return toSettings(row);
  }),

  update: privateProcedure.input(trackingPixelsUpdateSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const accepting = input.termsVersion === CREATOR_TRACKING_TERMS_VERSION;
    const data = {
      ga4_measurement_id: nextId(input.ga4MeasurementId),
      meta_pixel_id: nextId(input.metaPixelId),
      tiktok_pixel_id: nextId(input.tiktokPixelId),
      meta_capi_token_enc: nextToken(input.metaCapiToken),
      tiktok_events_token_enc: nextToken(input.tiktokEventsToken),
      ...(accepting
        ? { terms_version: CREATOR_TRACKING_TERMS_VERSION, terms_accepted_at: new Date() }
        : {}),
    };

    // Screen Review 093 D2: connecting or changing a pixel needs the current terms
    // on record. Clearing an ID or removing a token never does.
    const connects = [
      input.ga4MeasurementId,
      input.metaPixelId,
      input.tiktokPixelId,
      input.metaCapiToken,
      input.tiktokEventsToken,
    ].some(value => !!value);
    if (connects && !accepting) {
      const stored = await prisma.trackingPixels.findUnique({
        where: { user_id: userId },
        select: { terms_version: true },
      });
      if (stored?.terms_version !== CREATOR_TRACKING_TERMS_VERSION) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Accept the terms to save." });
      }
    }

    try {
      const row = await prisma.trackingPixels.upsert({
        where: { user_id: userId },
        create: { id: newAnalyticsId(), user_id: userId, ...data },
        update: data,
      });
      invalidatePixelConfig(userId);
      return toSettings(row);
    } catch (error) {
      console.error("[TRACKING] failed to save pixel settings", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save settings" });
    }
  }),
});

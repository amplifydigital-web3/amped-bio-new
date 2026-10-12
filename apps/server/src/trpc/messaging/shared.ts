import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import { TELEGRAM_APP_STRINGS, TELEGRAM_LIMITS } from "@repo/constants";
import { hexToId } from "../../services/analytics/ids";
import { MessagingRefusal, type MessagingRefusalReason } from "../../services/messaging/access";
import { MessagingInputError } from "../../services/messaging/threads";

/** Thread and message ids reach clients as 32 character lowercase hex (UUID v7). */
export const idSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, "Invalid id")
  .transform(hexToId);

export const cursorSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .nullish();

export const bodySchema = z
  .string()
  .min(1)
  .max(TELEGRAM_LIMITS.messageBodyMax + 200);
export const idempotencyKeySchema = z.string().min(8).max(64);

export const reportSchema = z.object({
  threadId: idSchema,
  messageId: idSchema.optional(),
  reason: z.enum(["SPAM", "HARASSMENT", "FINANCIAL_PROMISE", "OTHER"]),
  note: z.string().max(500).optional(),
});

/** Refusal copy for the web, keyed by the canMessage reason. */
export function refusalMessage(reason: MessagingRefusalReason, creatorName: string): string {
  const copy = TELEGRAM_APP_STRINGS.messagingRefusals;
  switch (reason) {
    case "sender_cap":
      return copy.sender_cap;
    case "sender_paused":
      return copy.sender_paused;
    default:
      return copy[reason](creatorName);
  }
}

async function creatorName(creatorUserId: number) {
  const user = await prisma.user.findUnique({
    where: { id: creatorUserId },
    select: { name: true },
  });
  return user?.name || "This creator";
}

/** Map service errors to tRPC errors with product copy. Rethrows anything else. */
export async function toTrpcError(error: unknown, creatorUserId?: number): Promise<never> {
  if (error instanceof MessagingRefusal) {
    const name = creatorUserId === undefined ? "This creator" : await creatorName(creatorUserId);
    throw new TRPCError({
      code: error.reason === "sender_cap" ? "TOO_MANY_REQUESTS" : "FORBIDDEN",
      message: refusalMessage(error.reason, name),
      cause: error,
    });
  }
  if (error instanceof MessagingInputError) {
    switch (error.code) {
      case "empty":
        throw new TRPCError({ code: "BAD_REQUEST", message: "Write a message first." });
      case "too_long":
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Messages are ${TELEGRAM_LIMITS.messageBodyMax.toLocaleString("en-US")} characters or fewer.`,
        });
      case "not_found":
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      case "thread_closed":
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This conversation is closed. Unblock it to reply.",
        });
    }
  }
  throw error;
}

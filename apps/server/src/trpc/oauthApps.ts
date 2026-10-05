import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { privateProcedure, router } from "./trpc";
import { prisma } from "@repo/database";
import { auth } from "../utils/auth";

const clientIdInput = z.object({ client_id: z.string().min(1) });

const redirectUriSchema = z.string().url();

const clientMetadataSchema = z.object({
  client_name: z.string().min(1, "Name is required").max(120),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
  redirect_uris: z.array(redirectUriSchema).min(1, "Add at least one redirect URI").max(10),
  application_type: z.enum(["web", "native"]),
  token_endpoint_auth_method: z.enum(["none", "client_secret_basic", "client_secret_post"]),
});

function toTRPCError(error: unknown): never {
  if (error instanceof TRPCError) throw error;

  const message =
    (error as { body?: { message?: string; error_description?: string } })?.body?.error_description ??
    (error as { body?: { message?: string } })?.body?.message ??
    (error as Error)?.message ??
    "OAuth request failed";

  throw new TRPCError({
    code: "BAD_REQUEST",
    message,
  });
}

/**
 * Self-service OAuth application management for the signed-in user.
 * Better Auth owns validation, secret hashing and ownership checks; this router
 * only forwards the caller's session.
 */
export const oauthAppsRouter = router({
  list: privateProcedure.query(async ({ ctx }) => {
    try {
      return await auth.api.getOAuthClients({ headers: ctx.req.headers as never });
    } catch (error) {
      return toTRPCError(error);
    }
  }),

  /**
   * Apps this person allowed (Account, Connected apps; Screen Review 092 I16,
   * D30). Each consent carries the client's name, icon and website so the row
   * can name the app instead of its client id.
   */
  consents: privateProcedure.query(async ({ ctx }) => {
    try {
      const consents = (await auth.api.getOAuthConsents({
        headers: ctx.req.headers as never,
      })) as unknown as Array<Record<string, unknown> & { clientId?: string }>;
      const clientIds = [
        ...new Set(consents.map(consent => consent.clientId).filter(Boolean)),
      ] as string[];
      const clients = clientIds.length
        ? await prisma.oauthClient.findMany({
            where: { clientId: { in: clientIds } },
            select: { clientId: true, name: true, icon: true, uri: true },
          })
        : [];
      const byId = new Map(clients.map(client => [client.clientId, client]));
      return consents.map(consent => {
        const client = consent.clientId ? byId.get(consent.clientId) : undefined;
        return {
          ...consent,
          clientName: client?.name ?? null,
          clientIcon: client?.icon ?? null,
          clientUri: client?.uri ?? null,
        };
      });
    } catch (error) {
      return toTRPCError(error);
    }
  }),

  create: privateProcedure.input(clientMetadataSchema).mutation(async ({ ctx, input }) => {
    try {
      return await auth.api.createOAuthClient({
        headers: ctx.req.headers as never,
        body: input,
      });
    } catch (error) {
      return toTRPCError(error);
    }
  }),

  update: privateProcedure
    .input(clientIdInput.extend({ update: clientMetadataSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.updateOAuthClient({
          headers: ctx.req.headers as never,
          body: input,
        });
      } catch (error) {
        return toTRPCError(error);
      }
    }),

  rotateSecret: privateProcedure.input(clientIdInput).mutation(async ({ ctx, input }) => {
    try {
      return await auth.api.rotateClientSecret({
        headers: ctx.req.headers as never,
        body: input,
      });
    } catch (error) {
      return toTRPCError(error);
    }
  }),

  remove: privateProcedure.input(clientIdInput).mutation(async ({ ctx, input }) => {
    try {
      return await auth.api.deleteOAuthClient({
        headers: ctx.req.headers as never,
        body: input,
      });
    } catch (error) {
      return toTRPCError(error);
    }
  }),

  revokeConsent: privateProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    try {
      return await auth.api.deleteOAuthConsent({
        headers: ctx.req.headers as never,
        body: input,
      });
    } catch (error) {
      return toTRPCError(error);
    }
  }),
});

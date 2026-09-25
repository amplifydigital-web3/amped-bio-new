import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../trpc";
import { auth } from "../../utils/auth";
import { prisma } from "@repo/database";

function toTRPCError(error: unknown): never {
  if (error instanceof TRPCError) throw error;

  const message =
    (error as { body?: { message?: string; error_description?: string } })?.body?.error_description ??
    (error as { body?: { message?: string } })?.body?.message ??
    (error as Error)?.message ??
    "OAuth request failed";

  throw new TRPCError({ code: "BAD_REQUEST", message });
}

/**
 * Administrative OAuth application management. These endpoints reach Better
 * Auth's server-only APIs, which allow restricted fields such as
 * `skip_consent`, `enable_end_session` and client secret expiration.
 */
export const oauthAppsAdminRouter = router({
  listClients: adminProcedure.query(async () => {
    const clients = await prisma.oauthClient.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        clientId: true,
        name: true,
        uri: true,
        icon: true,
        disabled: true,
        skipConsent: true,
        enableEndSession: true,
        applicationType: true,
        tokenEndpointAuthMethod: true,
        redirectUris: true,
        createdAt: true,
        userId: true,
        referenceId: true,
        clientSecret: true,
      },
    });

    return clients.map(client => ({
      ...client,
      hasSecret: Boolean(client.clientSecret),
      clientSecret: undefined,
      redirectUris: parseRedirectUris(client.redirectUris),
    }));
  }),

  resources: adminProcedure.query(async () => {
    return prisma.oauthResource.findMany({
      orderBy: { identifier: "asc" },
      select: {
        identifier: true,
        name: true,
        disabled: true,
        accessTokenTtl: true,
        allowedScopes: true,
      },
    });
  }),

  createClient: adminProcedure
    .input(
      z.object({
        client_name: z.string().min(1).max(120),
        redirect_uris: z.array(z.string().url()).min(1),
        application_type: z.enum(["web", "native"]).default("web"),
        token_endpoint_auth_method: z
          .enum(["none", "client_secret_basic", "client_secret_post", "private_key_jwt"])
          .default("client_secret_basic"),
        skip_consent: z.boolean().default(false),
        enable_end_session: z.boolean().default(false),
        client_secret_expires_at: z.number().int().min(0).default(0),
        client_uri: z.string().url().optional(),
        logo_uri: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.adminCreateOAuthClient({
          headers: ctx.req.headers as never,
          body: input,
        });
      } catch (error) {
        return toTRPCError(error);
      }
    }),

  updateClient: adminProcedure
    .input(
      z.object({
        client_id: z.string().min(1),
        update: z.object({
          client_name: z.string().min(1).max(120).optional(),
          redirect_uris: z.array(z.string().url()).min(1).optional(),
          skip_consent: z.boolean().optional(),
          enable_end_session: z.boolean().optional(),
          client_secret_expires_at: z.union([z.string(), z.number()]).optional(),
          application_type: z.enum(["web", "native"]).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.adminUpdateOAuthClient({
          headers: ctx.req.headers as never,
          body: input,
        });
      } catch (error) {
        return toTRPCError(error);
      }
    }),

  setClientDisabled: adminProcedure
    .input(z.object({ client_id: z.string().min(1), disabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const client = await prisma.oauthClient.findUnique({
        where: { clientId: input.client_id },
        select: { id: true },
      });

      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "OAuth client not found" });
      }

      await prisma.oauthClient.update({
        where: { clientId: input.client_id },
        data: { disabled: input.disabled },
      });

      return { client_id: input.client_id, disabled: input.disabled };
    }),
});

export function parseRedirectUris(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

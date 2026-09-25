import express, { type Request as ExpressRequest, type Response, type Router } from "express";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import type { AuthInfo, CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { auth } from "../utils/auth";
import { env } from "../env";
import { prisma } from "../services/DB";

const READ_SCOPE = "mcp:read";

const mcpServer = new McpServer({
  name: "amped-bio",
  version: "1.0.0",
});

function claimsFromAuthInfo(authInfo?: AuthInfo) {
  const extra = (authInfo?.extra ?? {}) as {
    sub?: string;
    email?: string;
    scope?: string;
    wallet?: string;
  };

  return {
    sub: extra.sub ?? null,
    email: extra.email ?? null,
    wallet: extra.wallet ?? null,
    scope: extra.scope ?? "",
    scopes: (extra.scope ?? "").split(" ").filter(Boolean),
  };
}

function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

mcpServer.registerTool(
  "whoami",
  {
    title: "Who am I",
    description: "Return the Amped.bio account the current access token belongs to.",
  },
  async (ctx: ServerContext): Promise<CallToolResult> => {
    return textResult(JSON.stringify(claimsFromAuthInfo(ctx.http?.authInfo), null, 2));
  }
);

mcpServer.registerTool(
  "list_creator_pools",
  {
    title: "List creator pools",
    description: "List the creator pools owned by the wallet linked to the authenticated account.",
  },
  async (ctx: ServerContext): Promise<CallToolResult> => {
    const claims = claimsFromAuthInfo(ctx.http?.authInfo);
    const userId = Number(claims.sub);

    if (!Number.isFinite(userId)) {
      return textResult("The access token is not bound to a numeric user id.", true);
    }

    const wallet = await prisma.userWallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      return textResult("No wallet is linked to this account.");
    }

    const pools = await prisma.creatorPool.findMany({
      where: { walletId: wallet.id },
      select: { chainId: true, poolAddress: true, name: true, revoStaked: true },
      orderBy: { id: "desc" },
      take: 25,
    });

    return textResult(JSON.stringify(pools, null, 2));
  }
);

const mcpHandler = createMcpHandler(() => mcpServer);

/**
 * `requireMcpAuth` verifies the bearer access token (signature, issuer,
 * audience, expiry and required scopes) and answers unauthenticated requests
 * with the RFC 9728 challenge that lets MCP clients start the OAuth flow.
 */
const protectedHandler = requireMcpAuth(
  auth,
  (request: globalThis.Request, accessTokenClaims) => {
    const claims = accessTokenClaims as Record<string, unknown>;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

    return mcpHandler.fetch(request, {
      authInfo: {
        token: bearer,
        clientId: String(claims.client_id ?? claims.azp ?? ""),
        scopes: String(claims.scope ?? "")
          .split(" ")
          .filter(Boolean),
        expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
        extra: claims,
      },
    });
  },
  {
    resource: env.MCP_RESOURCE_URL,
    requiredScopes: [READ_SCOPE],
  }
);

const mcpRouter: Router = express.Router();

/** Streamable HTTP transport entry point of the MCP server. */
mcpRouter.all("/", express.raw({ type: "*/*", limit: "1mb" }), async (req: ExpressRequest, res: Response) => {
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const rawBody = req.body as Buffer | undefined;

  const request = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: ["GET", "HEAD"].includes(req.method) || !rawBody ? undefined : new Uint8Array(rawBody),
  });

  const response = await protectedHandler(request);

  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(Buffer.from(await response.arrayBuffer()));
});

export default mcpRouter;

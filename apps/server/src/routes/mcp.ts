import express, { type Request as ExpressRequest, type Response, type Router } from "express";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import type { AuthInfo, CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { auth } from "../utils/auth";
import { env } from "../env";
import { prisma } from "@repo/database";
import { z } from "zod";

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

// ──────────────────────────────────────────────
// RNS / REVO name resolution helpers
// ──────────────────────────────────────────────

const RevoNameSubgraphSchema = z.object({
  data: z.object({
    revoNames: z.array(
      z.object({
        labelName: z.string().optional(),
        expiryDateWithGrace: z.string(),
        owner: z.string(),
      })
    ),
  }),
});

async function queryRnsSubgraph(
  query: string,
  variables: Record<string, unknown>
): Promise<z.infer<typeof RevoNameSubgraphSchema>["data"]["revoNames"]> {
  const subgraphUrl = env.SUBGRAPH_URL;
  if (!subgraphUrl) {
    throw new Error("SUBGRAPH_URL is not configured on this server.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      throw new Error(`Subgraph responded with status ${res.status}`);
    }

    const json = await res.json();

    if (json?.errors?.length) {
      throw new Error(`Subgraph GraphQL error: ${json.errors[0]?.message ?? "unknown"}`);
    }

    const parsed = RevoNameSubgraphSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("Subgraph returned unexpected data shape.");
    }

    return parsed.data.data.revoNames;
  } finally {
    clearTimeout(timeout);
  }
}

async function findAmpedBioProfileByWallet(
  walletAddress: string
): Promise<{ handle: string | null; name: string | null } | null> {
  // MySQL utf8mb4_unicode_ci collation is case-insensitive by default,
  // so a simple `equals` without mode works fine for case-insensitive matching.
  const user = await prisma.user.findFirst({
    where: { wallet: { address: walletAddress } },
    select: { handle: true, name: true },
  });
  return user;
}

mcpServer.registerTool(
  "rns_lookup",
  {
    title: "RNS name lookup",
    description:
      "Resolve a REVO Name Service (RNS) name (e.g. \"foo.revo\") to its owner wallet, expiry date, " +
      "and whether the owner has a linked Amped.bio profile.",
    parameters: z.object({
      name: z
        .string()
        .describe(
          "The full RNS name to look up, e.g. \"foo.revo\" or just \"foo\" (the .revo suffix is optional)."
        ),
    }),
  },
  async (params: { name: string }): Promise<CallToolResult> => {
    try {
      const labelName = params.name.replace(/\.revo$/i, "").toLowerCase();

      const names = await queryRnsSubgraph(
        `query ($l: String!) {
          revoNames(where: { labelName: $l }) {
            labelName
            expiryDateWithGrace
            owner
          }
        }`,
        { l: labelName }
      );

      if (names.length === 0) {
        return textResult(
          JSON.stringify({ found: false, name: `${labelName}.revo` }),
          true
        );
      }

      const entry = names[0];
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const expiryTimestamp = Number(entry.expiryDateWithGrace);
      const expired = expiryTimestamp > 0 && expiryTimestamp < nowInSeconds;
      const owner = entry.owner;

      // Check if the owner has an Amped.bio profile linked to this wallet
      const profile = await findAmpedBioProfileByWallet(owner);

      return textResult(
        JSON.stringify(
          {
            found: true,
            name: `${labelName}.revo`,
            owner,
            expiryTimestamp,
            expiryDate: new Date(expiryTimestamp * 1000).toISOString(),
            expired,
            ampedBioProfile: profile
              ? { handle: profile.handle, name: profile.name }
              : null,
          },
          null,
          2
        )
      );
    } catch (err) {
      return textResult(
        `RNS lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        true
      );
    }
  }
);

mcpServer.registerTool(
  "rns_reverse_lookup",
  {
    title: "RNS reverse lookup",
    description:
      "Given a wallet address, list all REVO Name Service (RNS) names owned by that address.",
    parameters: z.object({
      wallet: z.string().describe("The wallet address to look up RNS names for."),
    }),
  },
  async (params: { wallet: string }): Promise<CallToolResult> => {
    try {
      const owner = params.wallet.toLowerCase();

      const names = await queryRnsSubgraph(
        `query ($o: String!) {
          revoNames(where: { owner: $o }) {
            labelName
            expiryDateWithGrace
            owner
          }
        }`,
        { o: owner }
      );

      if (names.length === 0) {
        return textResult(
          JSON.stringify({ found: false, wallet: params.wallet, names: [] }),
          true
        );
      }

      const nowInSeconds = Math.floor(Date.now() / 1000);

      const result = names.map(n => {
        const expiryTimestamp = Number(n.expiryDateWithGrace);
        const expired = expiryTimestamp > 0 && expiryTimestamp < nowInSeconds;
        return {
          name: `${n.labelName ?? "?"}.revo`,
          expiryTimestamp,
          expiryDate: new Date(expiryTimestamp * 1000).toISOString(),
          expired,
        };
      });

      // Also check if this wallet is linked to an Amped.bio profile
      const profile = await findAmpedBioProfileByWallet(params.wallet);

      return textResult(
        JSON.stringify(
          {
            found: true,
            wallet: params.wallet,
            names: result,
            ampedBioProfile: profile
              ? { handle: profile.handle, name: profile.name }
              : null,
          },
          null,
          2
        )
      );
    } catch (err) {
      return textResult(
        `RNS reverse lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        true
      );
    }
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

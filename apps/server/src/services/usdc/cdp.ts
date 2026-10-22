import { createHash, randomBytes } from "node:crypto";
import { SignJWT, importJWK, importPKCS8 } from "jose";

/**
 * A minimal Coinbase Developer Platform (CDP) v2 REST client for the relayer
 * (spec 3.4, decision 2). It signs requests the same way @coinbase/cdp-sdk
 * does: a Bearer JWT from the API key (Ed25519 or EC), plus an X-Wallet-Auth
 * JWT from the Wallet Secret on account writes. Only the two calls the
 * relayer needs are here, so the server takes no SDK dependency (the SDK
 * pins a newer viem and pulls Solana packages).
 *
 * The key never leaves Coinbase: CDP signs inside its trusted execution
 * environment and enforces the Policy Engine rules on every send.
 */

const CDP_HOST = "api.cdp.coinbase.com";
const CDP_BASE = `https://${CDP_HOST}/platform`;

export type CdpCredentials = {
  apiKeyId: string;
  apiKeySecret: string;
  walletSecret: string;
};

export class CdpError extends Error {
  constructor(
    readonly status: number,
    readonly errorType: string,
    message: string,
    readonly correlationId?: string
  ) {
    super(message);
    this.name = "CdpError";
  }
}

function jwtNonce() {
  return randomBytes(16).toString("hex");
}

/** Recursively sorted keys, so the request hash matches what CDP computes. */
export function sortKeys(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeys((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

async function signingKey(apiKeySecret: string) {
  // EC keys come as a PEM; Ed25519 keys as 64 base64 bytes (seed then public key)
  if (apiKeySecret.includes("BEGIN")) {
    return { key: await importPKCS8(apiKeySecret.replace(/\\n/g, "\n"), "ES256"), alg: "ES256" };
  }
  const decoded = Buffer.from(apiKeySecret, "base64");
  if (decoded.length !== 64)
    throw new Error("CDP API key secret is neither a PEM EC key nor a base64 Ed25519 key");
  const key = await importJWK(
    {
      kty: "OKP",
      crv: "Ed25519",
      d: decoded.subarray(0, 32).toString("base64url"),
      x: decoded.subarray(32).toString("base64url"),
    },
    "EdDSA"
  );
  return { key, alg: "EdDSA" };
}

/** Bearer token for one request (expires in 120 seconds). */
export async function cdpBearerJwt(
  creds: Pick<CdpCredentials, "apiKeyId" | "apiKeySecret">,
  method: string,
  path: string,
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  const { key, alg } = await signingKey(creds.apiKeySecret);
  return new SignJWT({
    sub: creds.apiKeyId,
    iss: "cdp",
    uris: [`${method} ${CDP_HOST}${path}`],
  })
    .setProtectedHeader({ alg, kid: creds.apiKeyId, typ: "JWT", nonce: jwtNonce() })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

/** X-Wallet-Auth token: binds the Wallet Secret to this exact request and body. */
export async function cdpWalletJwt(
  walletSecret: string,
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  const claims: Record<string, unknown> = { uris: [`${method} ${CDP_HOST}${path}`] };
  if (body && Object.values(body).some(value => value !== undefined)) {
    claims.reqHash = createHash("sha256")
      .update(JSON.stringify(sortKeys(body)))
      .digest("hex");
  }
  const der = Buffer.from(walletSecret, "base64").toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`;
  const key = await importPKCS8(pem, "ES256");
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setJti(jwtNonce())
    .sign(key);
}

type FetchLike = typeof fetch;

export class CdpClient {
  constructor(
    private readonly creds: CdpCredentials,
    private readonly fetcher: FetchLike = fetch
  ) {}

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { body?: Record<string, unknown>; walletAuth?: boolean; idempotencyKey?: string } = {}
  ): Promise<T> {
    const fullPath = `/platform${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await cdpBearerJwt(this.creds, method, fullPath)}`,
    };
    if (options.walletAuth) {
      headers["X-Wallet-Auth"] = await cdpWalletJwt(
        this.creds.walletSecret,
        method,
        fullPath,
        options.body
      );
    }
    if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;

    const response = await this.fetcher(`${CDP_BASE}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new CdpError(
        response.status,
        String(json.errorType ?? "unknown"),
        String(json.errorMessage ?? `CDP ${method} ${path} failed with ${response.status}`),
        typeof json.correlationId === "string" ? json.correlationId : undefined
      );
    }
    return json as T;
  }

  /** The relayer account created once per environment in the CDP Portal. */
  getEvmAccountByName(name: string) {
    return this.request<{ address: `0x${string}`; name?: string; policies?: string[] }>(
      "GET",
      `/v2/evm/accounts/by-name/${encodeURIComponent(name)}`
    );
  }

  /**
   * CDP signs and broadcasts an RLP encoded EIP-1559 transaction. CDP fills
   * nonce, gas and fees and applies the account's policies first.
   */
  sendEvmTransaction(
    address: string,
    body: { network: "base" | "base-sepolia"; transaction: `0x${string}` },
    idempotencyKey?: string
  ) {
    return this.request<{ transactionHash: `0x${string}` }>(
      "POST",
      `/v2/evm/accounts/${address}/send/transaction`,
      { body, walletAuth: true, idempotencyKey }
    );
  }
}

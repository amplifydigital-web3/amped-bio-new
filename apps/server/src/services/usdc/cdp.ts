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
// Onramp v1 (buy config, buy options, transaction status) still lives on the developer host
const ONRAMP_V1_HOST = "api.developer.coinbase.com";

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
  now = Math.floor(Date.now() / 1000),
  host = CDP_HOST
): Promise<string> {
  const { key, alg } = await signingKey(creds.apiKeySecret);
  return new SignJWT({
    sub: creds.apiKeyId,
    iss: "cdp",
    uris: [`${method} ${host}${path}`],
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

  /**
   * Onramp v1 on the developer host (buy config, buy options, transaction status).
   * The JWT names the path without the query string.
   */
  private async onrampV1<T>(path: string, query: Record<string, string | undefined> = {}) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await cdpBearerJwt(this.creds, "GET", path, undefined, ONRAMP_V1_HOST)}`,
    };
    const search = new URLSearchParams(
      Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])
    ).toString();
    const response = await this.fetcher(
      `https://${ONRAMP_V1_HOST}${path}${search ? `?${search}` : ""}`,
      { method: "GET", headers, signal: AbortSignal.timeout(15_000) }
    );
    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new CdpError(
        response.status,
        String(json.errorType ?? json.code ?? "unknown"),
        String(
          json.errorMessage ?? json.message ?? `Onramp GET ${path} failed with ${response.status}`
        )
      );
    }
    return json as T;
  }

  /** Countries, US states and payment methods Coinbase serves (Buy Config). */
  getOnrampBuyConfig() {
    return this.onrampV1<OnrampBuyConfig>("/onramp/v1/buy/config");
  }

  /** Fiat limits per payment method and the assets on offer for one region (Buy Options). */
  getOnrampBuyOptions(country: string, subdivision?: string) {
    return this.onrampV1<OnrampBuyOptions>("/onramp/v1/buy/options", {
      country,
      subdivision,
      networks: "base",
    });
  }

  /** The user's onramp transactions, newest first (Transaction Status API). */
  getOnrampTransactions(partnerUserRef: string, pageSize = 5) {
    return this.onrampV1<OnrampTransactionsPage>(
      `/onramp/v1/buy/user/${encodeURIComponent(partnerUserRef)}/transactions`,
      { page_size: String(pageSize) }
    );
  }

  /**
   * Hosted Onramp session (Coinbase account path). With paymentAmount,
   * paymentCurrency, paymentMethod, country and subdivision the response also
   * carries Coinbase's quote. The URL is single use and lives five minutes.
   */
  createOnrampSession(body: OnrampSessionRequest) {
    return this.request<{ session: { onrampUrl: string }; quote?: OnrampQuote }>(
      "POST",
      "/v2/onramp/sessions",
      { body: body as unknown as Record<string, unknown> }
    );
  }

  /**
   * Headless Onramp order (Apple Pay, Google Pay; US). With isQuote the order
   * is priced and not created. Otherwise the response carries the payment link
   * Coinbase renders in our page and, in embedded mode, the userAuthToken.
   */
  createOnrampOrder(body: OnrampOrderRequest) {
    return this.request<OnrampOrderResponse>("POST", "/v2/onramp/orders", {
      body: body as unknown as Record<string, unknown>,
    });
  }

  /** One Headless Onramp order by Coinbase's id. */
  getOnrampOrder(orderId: string) {
    return this.request<{ order: OnrampOrder }>(
      "GET",
      `/v2/onramp/orders/${encodeURIComponent(orderId)}`
    );
  }
}

/* Coinbase Onramp shapes, as documented (v2 camelCase, v1 snake_case). */

export type OnrampFee = { type: string; amount: string; currency: string };

export type OnrampQuote = {
  paymentTotal: string;
  paymentSubtotal: string;
  paymentCurrency: string;
  purchaseAmount: string;
  purchaseCurrency: string;
  destinationNetwork: string;
  fees: OnrampFee[];
  exchangeRate: string;
};

export type OnrampSessionRequest = {
  purchaseCurrency: "USDC";
  destinationNetwork: "base";
  destinationAddress: string;
  paymentAmount?: string;
  paymentCurrency?: string;
  paymentMethod?: "CARD" | "ACH" | "APPLE_PAY" | "PAYPAL" | "FIAT_WALLET" | "CRYPTO_WALLET";
  country?: string;
  subdivision?: string;
  redirectUrl?: string;
  clientIp?: string;
  partnerUserRef?: string;
};

export type OnrampOrderRequest = {
  paymentAmount: string;
  paymentCurrency: string;
  purchaseCurrency: "USDC";
  paymentMethod: "GUEST_CHECKOUT_APPLE_PAY" | "GUEST_CHECKOUT_GOOGLE_PAY";
  destinationAddress: string;
  destinationNetwork: "base";
  /** ISO 8601 time the fan accepted Coinbase's terms (the agreement line). Not sent on a quote. */
  agreementAcceptedAt?: string;
  partnerUserRef: string;
  partnerOrderRef?: string;
  clientIp?: string;
  /** Host the payment link is embedded on; must be on the Onramp domain allowlist */
  domain?: string;
  /** Embedded mode: a returning fan's token skips Coinbase's phone and email steps */
  userAuthToken?: string;
  isQuote?: boolean;
};

export type OnrampOrder = {
  orderId: string;
  status: string;
  paymentTotal?: string;
  paymentSubtotal?: string;
  paymentCurrency?: string;
  purchaseAmount?: string;
  purchaseCurrency?: string;
  fees?: OnrampFee[];
  exchangeRate?: string;
  destinationAddress?: string;
  destinationNetwork?: string;
  txHash?: string;
  partnerUserRef?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type OnrampOrderResponse = {
  order: OnrampOrder;
  paymentLink?: { url: string; paymentLinkType?: string };
  userAuthToken?: string;
};

export type OnrampBuyConfig = {
  countries: { id: string; subdivisions?: string[]; payment_methods?: { id: string }[] }[];
};

export type OnrampBuyOptions = {
  payment_currencies?: { id: string; limits?: { id: string; min: string; max: string }[] }[];
  purchase_currencies?: {
    id: string;
    symbol: string;
    networks?: { name: string; chain_id?: number | string; contract_address?: string }[];
  }[];
};

type V1Amount = string | { value: string; currency?: string };

export type OnrampTransaction = {
  status: string;
  transaction_id?: string;
  tx_hash?: string;
  purchase_amount?: V1Amount;
  payment_total?: V1Amount;
  payment_method?: string;
  partner_user_ref?: string;
  wallet_address?: string;
  purchase_network?: string;
  created_at?: string;
};

export type OnrampTransactionsPage = {
  transactions?: OnrampTransaction[];
  next_page_key?: string;
  total_count?: string | number;
};

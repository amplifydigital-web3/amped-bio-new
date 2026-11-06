import express, { Router, type NextFunction, type Request, type Response } from "express";
import { prisma, type Prisma } from "@repo/database";
import { uuidv7 } from "../utils/uuid-v7";
import { hitRateLimit } from "../utils/rateLimit";
import { isFeatureOn } from "../services/featureFlags";
import { authenticateKey } from "../services/partners/keys";
import {
  OrderError,
  entitlements,
  getOrder,
  listOrders,
  reportFulfillment,
} from "../services/partners/orders";
import { prepareMerchantRefund, submitMerchantRefund } from "../services/partners/refunds";
import {
  MerchantOfferError,
  listMerchantOffers,
  upsertMerchantOffer,
} from "../services/merchants/offers";

/**
 * Partner API (Build Board #66, AB-4; docs/partners/authbase-integration.md section 9).
 * Mounted at /partners/v1. Bearer key per merchant, 120 requests a minute per key, an
 * Idempotency-Key on every write (the first answer is stored and replayed). Off until the
 * partnerApi flag is on. Errors are JSON { code, message }.
 */

const router: Router = Router();
const PER_MINUTE = 120;

type Authed = Request & { merchantId?: Buffer; keyId?: Buffer };

function fail(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ code, message });
}

router.use(express.json({ limit: "32kb" }));

router.use(async (req: Authed, res: Response, next: NextFunction) => {
  if (!isFeatureOn("partnerApi")) return fail(res, 404, "not_found", "Not found.");
  try {
    const auth = await authenticateKey(req.header("authorization"));
    if (!auth)
      return fail(res, 401, "unauthorized", "Send a valid API key as Authorization: Bearer.");
    if ((await hitRateLimit(`partner:${auth.keyId.toString("hex")}`, 60)) > PER_MINUTE) {
      res.setHeader("Retry-After", "60");
      return fail(res, 429, "rate_limited", "Too many requests. Try again in a minute.");
    }
    req.merchantId = auth.merchantId;
    req.keyId = auth.keyId;
    next();
  } catch (error) {
    next(error);
  }
});

/** Runs a write once per Idempotency-Key; a repeat gets the stored answer. */
async function idempotent(
  req: Authed,
  res: Response,
  route: string,
  run: () => Promise<{ status: number; body: unknown }>
) {
  const key = req.header("idempotency-key")?.trim();
  if (!key || key.length > 80)
    return fail(
      res,
      422,
      "idempotency_key_required",
      "Send an Idempotency-Key header on every write."
    );
  const merchantId = req.merchantId!;
  const stored = await prisma.partnerIdempotencyKey.findUnique({
    where: { merchantId_key: { merchantId, key } },
  });
  if (stored) {
    if (stored.route !== route)
      return fail(
        res,
        409,
        "idempotency_key_reused",
        "This Idempotency-Key was used for another call."
      );
    res.status(stored.status).json(stored.response);
    return;
  }
  let result: { status: number; body: unknown };
  try {
    result = await run();
  } catch (error) {
    if (error instanceof OrderError)
      result = { status: error.status, body: { code: error.code, message: error.message } };
    else if (error instanceof MerchantOfferError)
      result = { status: 422, body: { code: "invalid_product", message: error.message } };
    else throw error;
  }
  // Server errors are not stored, so a retry with the same key can succeed
  if (result.status < 500) {
    await prisma.partnerIdempotencyKey
      .create({
        data: {
          id: uuidv7(),
          merchantId,
          key,
          route,
          status: result.status,
          response: result.body as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }
  res.status(result.status).json(result.body);
}

function handle(fn: (req: Authed, res: Response) => Promise<void>) {
  return async (req: Authed, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof OrderError) return fail(res, error.status, error.code, error.message);
      next(error);
    }
  };
}

const q = (req: Request, name: string) =>
  typeof req.query[name] === "string" ? (req.query[name] as string) : undefined;

router.get(
  "/orders/:ref",
  handle(async (req, res) => {
    res.json(await getOrder(req.merchantId!, String(req.params.ref)));
  })
);

router.get(
  "/orders",
  handle(async (req, res) => {
    const from = q(req, "created_from");
    const to = q(req, "created_to");
    res.json(
      await listOrders(req.merchantId!, {
        status: q(req, "status"),
        wallet: q(req, "wallet"),
        rnsName: q(req, "rns_name"),
        productCode: q(req, "product_code"),
        ...(from ? { createdFrom: new Date(from) } : {}),
        ...(to ? { createdTo: new Date(to) } : {}),
        cursor: q(req, "cursor"),
        limit: q(req, "limit") ? Number(q(req, "limit")) : undefined,
      })
    );
  })
);

router.get(
  "/entitlements",
  handle(async (req, res) => {
    res.json(await entitlements(req.merchantId!, q(req, "wallet") ?? ""));
  })
);

router.post(
  "/orders/:ref/fulfillment",
  handle(async (req, res) => {
    const ref = String(req.params.ref);
    await idempotent(req, res, `fulfillment:${ref}`, async () => ({
      status: 200,
      body: await reportFulfillment(req.merchantId!, ref, req.body ?? {}),
    }));
  })
);

router.post(
  "/orders/:ref/refund",
  handle(async (req, res) => {
    const ref = String(req.params.ref);
    await idempotent(req, res, `refund:${ref}`, async () => ({
      status: 200,
      body: await prepareMerchantRefund(req.merchantId!, ref),
    }));
  })
);

router.post(
  "/orders/:ref/refund/submit",
  handle(async (req, res) => {
    const ref = String(req.params.ref);
    await idempotent(req, res, `refund_submit:${ref}`, async () => ({
      status: 202,
      body: await submitMerchantRefund(req.merchantId!, ref, req.body ?? {}),
    }));
  })
);

router.get(
  "/products",
  handle(async (req, res) => {
    res.json({ data: await listMerchantOffers(req.merchantId!) });
  })
);

router.put(
  "/products/:code",
  handle(async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    await idempotent(req, res, `product:${code}`, async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const existing = (await listMerchantOffers(req.merchantId!)).find(o => o.code === code);
      if (typeof body.amount_units !== "string" || !/^[1-9]\d{0,12}$/.test(body.amount_units)) {
        return {
          status: 422,
          body: {
            code: "invalid_amount",
            message: "amount_units is a whole number of USDC base units.",
          },
        };
      }
      const result = await upsertMerchantOffer({
        merchantId: req.merchantId!,
        actorId: 0,
        ...(existing ? { id: Buffer.from(existing.id, "hex") } : {}),
        code,
        title: String(body.title ?? existing?.title ?? code),
        description:
          typeof body.description === "string" ? body.description : (existing?.description ?? null),
        features: Array.isArray(body.features)
          ? body.features.map(String)
          : (existing?.features ?? []),
        tag: typeof body.tag === "string" ? body.tag : (existing?.tag ?? null),
        amountUnits: BigInt(body.amount_units),
        rank: typeof body.rank === "number" ? body.rank : (existing?.rank ?? 0),
        status:
          (["draft", "active", "paused"] as const).find(s => s === body.status) ??
          (existing?.status as "draft" | "active" | "paused" | undefined) ??
          "draft",
      });
      return { status: 200, body: result };
    });
  })
);

export default router;

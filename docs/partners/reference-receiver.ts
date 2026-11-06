/**
 * Reference webhook receiver for Amped.Bio merchant webhooks (partner spec section 8).
 * Node 22+, no dependencies. Run: AMPED_WEBHOOK_SECRET=whsec_... node --experimental-strip-types reference-receiver.ts
 *
 * 1. Read the raw body before any JSON parsing.
 * 2. Check Amped-Signature: HMAC SHA-256 over `${t}.${rawBody}`, constant time compare.
 * 3. Reject a timestamp more than 5 minutes from your clock.
 * 4. Dedupe on event_id, then answer 2xx within 10 seconds and do the work afterwards.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const SECRET = process.env.AMPED_WEBHOOK_SECRET ?? "";
const TOLERANCE_SECONDS = 300;
const seen = new Set<string>(); // use your database in production

function verify(header: string, raw: string): boolean {
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", SECRET).update(`${t}.${raw}`).digest();
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!verify(String(req.headers["amped-signature"] ?? ""), raw)) {
      res.writeHead(401).end();
      return;
    }
    const event = JSON.parse(raw) as { event_id: string; type: string; data: { order?: { order_ref: string } } };
    res.writeHead(200).end();
    if (seen.has(event.event_id)) return;
    seen.add(event.event_id);
    // order.paid: store the order so /verify can find it. order.refunded: void any open check.
    console.log(event.type, event.data.order?.order_ref ?? "");
  });
}).listen(8787);

/**
 * The toolbox container and its only door to R2 (spec 3.5).
 *
 * The container runs with no internet (enableInternet false). It may reach the
 * ClamAV signature mirror, and http://r2.internal, which never leaves Cloudflare:
 * the outbound handler below answers it inside this Worker. Each request must carry
 * the job grant (grant.ts) and may only read that item's incoming/ keys or write
 * its originals/, audio/ and derived/ keys. Quarantine copies and deletes stay in
 * the Worker.
 */
import { Container } from "@cloudflare/containers";
import { GRANT_HEADER, keyAllowed, verifyGrant } from "./grant";

/** The largest upload is 500 MB (spec 3.2); normalized output is smaller. */
export const OUTBOUND_PUT_MAX_BYTES = 600 * 1024 * 1024;

function status(code: number): Response {
  return new Response(null, { status: code });
}

export async function handleR2Outbound(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/object/")) return status(404);
  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice("/object/".length));
  } catch {
    return status(400);
  }
  const publicId = await verifyGrant(
    request.headers.get(GRANT_HEADER),
    env.CONTENT_PROCESSOR_SECRET
  );
  if (!publicId || !keyAllowed(request.method, key, publicId)) {
    console.warn(
      JSON.stringify({
        event: "processor.r2_refused",
        method: request.method,
        key,
        grant: Boolean(publicId),
      })
    );
    return status(403);
  }

  if (request.method === "GET") {
    const object = await env.CONTENT.get(key);
    if (!object) return status(404);
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "content-length": String(object.size),
      },
    });
  }

  // PUT
  const length = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length < 0) return status(411);
  if (length > OUTBOUND_PUT_MAX_BYTES) return status(413);
  const httpMetadata = {
    contentType: request.headers.get("content-type") ?? "application/octet-stream",
  };
  if (length === 0 || !request.body) {
    await env.CONTENT.put(key, "", { httpMetadata });
    return status(200);
  }
  const { readable, writable } = new FixedLengthStream(length);
  const piping = request.body.pipeTo(writable);
  await env.CONTENT.put(key, readable, { httpMetadata });
  await piping;
  return status(200);
}

export class ProcessorContainer extends Container<Env> {
  override defaultPort = 8080;
  override sleepAfter = "10m";
  override enableInternet = false;
  override allowedHosts = ["database.clamav.net"];
}

ProcessorContainer.outboundByHost = {
  "r2.internal": (request: Request, env: unknown) => handleR2Outbound(request, env as Env),
};

/** R2 helpers for the processor: hash, copy, prefix delete. */
import { toHex } from "./crypto";

/** SHA-256 of an object, streamed. Null when the object is missing. */
export async function sha256Object(bucket: R2Bucket, key: string): Promise<string | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  const digest = new crypto.DigestStream("SHA-256");
  await object.body.pipeTo(digest);
  return toHex(await digest.digest);
}

/** Copies an object inside the bucket. Returns its size, or null when missing. */
export async function copyObject(
  bucket: R2Bucket,
  from: string,
  to: string,
  contentType?: string
): Promise<number | null> {
  const object = await bucket.get(from);
  if (!object) return null;
  const { readable, writable } = new FixedLengthStream(object.size);
  const piping = object.body.pipeTo(writable);
  await bucket.put(to, readable, {
    httpMetadata: { contentType: contentType ?? object.httpMetadata?.contentType },
  });
  await piping;
  return object.size;
}

/** Deletes every object under a prefix. Prefixes always end in `/{publicId}/`. */
export async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  if (!/^[a-z]+\/[a-z0-9]{16}\/$/.test(prefix)) throw new Error(`refusing prefix ${prefix}`);
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map(object => object.key);
    if (keys.length) await bucket.delete(keys);
    deleted += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

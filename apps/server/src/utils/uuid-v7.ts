import { randomBytes } from "crypto";

/**
 * Generate a UUID v7 (time-ordered) as a 16-byte Buffer.
 *
 * Byte layout (RFC 9562):
 *   [0-5]  — 48-bit Unix timestamp (ms), big-endian
 *   [6-7]  — version (0b0111) + 12 random bits
 *   [8-15] — variant (RFC 9562 / RFC 4122, 0b10xx) + 62 random bits
 *
 * Storing the raw 16-byte buffer in MySQL BINARY(16) instead of a 36-char
 * VARCHAR saves space, keeps indexes denser, and avoids collation overhead.
 * Time-ordering keeps B-tree indexes compact — unlike UUID v4, new inserts
 * are appended near the end of the index rather than scattered randomly.
 */
// Monotonic within this process (RFC 9562 section 6.2, method 1): ids made in the same
// millisecond count up in the 12 bit rand_a field, so their order matches creation order.
// Amped Messages replay (PR M5) relies on this to resume after a message id.
let lastTime = 0;
let lastSeq = 0;

export function uuidv7(): Buffer {
  let time = Date.now();
  const buf = randomBytes(16);
  let seq: number;
  if (time <= lastTime) {
    time = lastTime;
    seq = lastSeq + 1;
    if (seq > 0xfff) {
      time += 1;
      seq = buf[7]! & 0x7f;
    }
  } else {
    // Start low in the field so many ids fit in one millisecond
    seq = ((buf[6]! & 0x07) << 8) | buf[7]!;
  }
  lastTime = time;
  lastSeq = seq;

  // Split the 48-bit Unix timestamp into:
  //   hi = upper 32 bits (time / 65536)
  //   lo = lower 16 bits (time & 0xFFFF)
  const hi = Math.floor(time / 0x10000);
  const lo = time & 0xffff;

  // Write hi as 32-bit big-endian into bytes 0-3
  buf[0] = (hi >>> 24) & 0xff;
  buf[1] = (hi >>> 16) & 0xff;
  buf[2] = (hi >>> 8) & 0xff;
  buf[3] = hi & 0xff;
  // Write lo as 16-bit big-endian into bytes 4-5
  buf[4] = (lo >>> 8) & 0xff;
  buf[5] = lo & 0xff;

  // Version 7 (0b0111) in the high 4 bits of byte 6, then the 12 bit sequence
  buf[6] = 0x70 | ((seq >>> 8) & 0x0f);
  buf[7] = seq & 0xff;
  // Variant RFC 9562 / RFC 4122 (0b10xx) occupying the high 2 bits of byte 8
  buf[8] = (buf[8] & 0x3f) | 0x80;

  return buf;
}

/**
 * Return a hex string (32 chars, no dashes) for display / logs.
 */
export function uuidv7Hex(): string {
  return uuidv7().toString("hex");
}

/**
 * UUID v7 unit tests
 */
import { describe, it, expect } from "vitest";
import { uuidv7 } from "../utils/uuid-v7";

describe("uuidv7", () => {
  it("returns a Buffer of exactly 16 bytes", () => {
    const id = uuidv7();
    expect(id).toBeInstanceOf(Buffer);
    expect(id.length).toBe(16);
  });

  it("marks the version nibble as 0b0111 (version 7)", () => {
    const id = uuidv7();
    // Byte 6, high 4 bits should be 0b0111 = 0x70
    expect((id[6] & 0xf0)).toBe(0x70);
  });

  it("marks the variant as RFC 9562 (high 2 bits of byte 8 = 0b10)", () => {
    const id = uuidv7();
    // Byte 8, high 2 bits should be 0b10 = 0x80
    expect((id[8] & 0xc0)).toBe(0x80);
  });

  it("is time-ordered: later calls produce lexicographically larger buffers", () => {
    const ids = Array.from({ length: 100 }, () => uuidv7());
    for (let i = 1; i < ids.length; i++) {
      // Compare as 16-byte buffers — timestamps are at the front
      expect(ids[i].compare(ids[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });

  it("has sufficient randomness: 1000 consecutive ids are unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = uuidv7().toString("hex");
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("embeds the current timestamp within a reasonable delta", () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();

    // Extract the 48-bit timestamp from bytes 0-5
    const extracted =
      (id[0] * 2 ** 40) + (id[1] * 2 ** 32) + (id[2] * 2 ** 24) +
      (id[3] * 2 ** 16) + (id[4] * 2 ** 8) + id[5];

    expect(extracted).toBeGreaterThanOrEqual(before);
    expect(extracted).toBeLessThanOrEqual(after + 5); // 5ms tolerance
  });
});
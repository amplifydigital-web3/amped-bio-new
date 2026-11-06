/**
 * The in-house MaxMind DB reader used for GeoLite2 City. The database is built
 * in the test from the format spec (https://maxmind.github.io/MaxMind-DB/), so
 * no license key, binary fixture or network is needed.
 */
import { describe, expect, it } from "vitest";
import { MmdbReader } from "../services/analytics/mmdbReader";

// --- Minimal MaxMind DB writer (test only) ---------------------------------

function ctrl(type: number, size: number): Buffer {
  const extended = type > 7;
  const head = (extended ? 0 : type << 5) | Math.min(size, 28);
  const parts = [head];
  if (extended) parts.push(type - 7);
  if (size >= 29) parts.push(size - 29); // sizes used here stay under 285
  return Buffer.from(parts);
}

/** int32 (type 8) in the smallest two's complement byte count, sign preserved. */
function int32(value: number): Buffer {
  const full = Buffer.alloc(4);
  full.writeInt32BE(value);
  let start = 0;
  while (
    start < 3 &&
    ((full[start] === 0x00 && (full[start + 1] & 0x80) === 0) ||
      (full[start] === 0xff && (full[start + 1] & 0x80) !== 0))
  ) {
    start += 1;
  }
  const bytes = full.subarray(start);
  return Buffer.concat([ctrl(8, bytes.length), bytes]);
}

function encode(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([ctrl(2, bytes.length), bytes]);
  }
  if (typeof value === "boolean") return ctrl(14, value ? 1 : 0);
  if (typeof value === "number") {
    // uint32, smallest byte count
    const bytes: number[] = [];
    for (let v = value; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
    return Buffer.concat([ctrl(6, bytes.length), Buffer.from(bytes)]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([ctrl(11, value.length), ...value.map(encode)]);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return Buffer.concat([
    ctrl(7, entries.length),
    ...entries.flatMap(([k, v]) => [encode(k), encode(v)]),
  ]);
}

type Entry = { bits: number[]; record: Record<string, unknown> };

function v4Bits(cidr: string): number[] {
  const [ip, prefix] = cidr.split("/");
  const bits = ip
    .split(".")
    .flatMap(o => Number(o).toString(2).padStart(8, "0").split("").map(Number));
  return [...Array(96).fill(0), ...bits.slice(0, Number(prefix))];
}

function v6Bits(hexPrefix: string, prefix: number): number[] {
  // hexPrefix like "2a00:23c5" (leading groups only)
  const groups = hexPrefix.split(":");
  const bits = groups.flatMap(g =>
    parseInt(g, 16).toString(2).padStart(16, "0").split("").map(Number)
  );
  return bits.slice(0, prefix);
}

function buildMmdb(entries: Entry[], recordSize: 24 | 28 | 32 = 28): Buffer {
  type Node = { children: [Node | number | null, Node | number | null]; id?: number };
  const root: Node = { children: [null, null] };
  const data: Buffer[] = [];
  const offsets: number[] = [];
  let dataLength = 0;
  for (const entry of entries) {
    offsets.push(dataLength);
    const encoded = encode(entry.record);
    data.push(encoded);
    dataLength += encoded.length;
  }
  entries.forEach((entry, index) => {
    let node = root;
    entry.bits.forEach((bit, depth) => {
      const last = depth === entry.bits.length - 1;
      if (last) {
        node.children[bit] = -1 - index; // leaf marker
      } else {
        if (typeof node.children[bit] !== "object" || node.children[bit] === null) {
          node.children[bit] = { children: [null, null] };
        }
        node = node.children[bit] as Node;
      }
    });
  });

  const nodes: Node[] = [];
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    node.id = nodes.length;
    nodes.push(node);
    for (const child of node.children) if (child && typeof child === "object") queue.push(child);
  }
  const nodeCount = nodes.length;
  const recordValue = (child: Node | number | null): number => {
    if (child === null) return nodeCount;
    if (typeof child === "object") return child.id!;
    return nodeCount + 16 + offsets[-1 - child];
  };

  const bytesPerNode = (recordSize * 2) / 8;
  const tree = Buffer.alloc(nodeCount * bytesPerNode);
  nodes.forEach((node, i) => {
    const [left, right] = node.children.map(recordValue);
    const at = i * bytesPerNode;
    if (recordSize === 24) {
      tree.writeUIntBE(left, at, 3);
      tree.writeUIntBE(right, at + 3, 3);
    } else if (recordSize === 32) {
      tree.writeUInt32BE(left, at);
      tree.writeUInt32BE(right, at + 4);
    } else {
      tree.writeUIntBE(left & 0xffffff, at, 3);
      tree[at + 3] = ((left >> 24) << 4) | (right >> 24);
      tree.writeUIntBE(right & 0xffffff, at + 4, 3);
    }
  });

  const metadata = encode({
    node_count: nodeCount,
    record_size: recordSize,
    ip_version: 6,
    database_type: "GeoLite2-City",
    binary_format_major_version: 2,
    binary_format_minor_version: 0,
    build_epoch: 1_792_000_000,
    languages: ["en"],
  });
  return Buffer.concat([
    tree,
    Buffer.alloc(16),
    ...data,
    Buffer.from([0xab, 0xcd, 0xef]),
    Buffer.from("MaxMind.com"),
    metadata,
  ]);
}

// --- Tests -----------------------------------------------------------------

const MIAMI = { country: { iso_code: "US" }, city: { names: { en: "Miami", de: "Miami" } } };
const LONDON = { country: { iso_code: "GB" }, city: { names: { en: "London" } } };
const SAO_PAULO = { country: { iso_code: "BR" }, city: { names: { en: "São Paulo" } } };

const entries: Entry[] = [
  { bits: v4Bits("73.0.0.0/8"), record: MIAMI },
  { bits: v6Bits("2a00:23c5", 32), record: LONDON },
  { bits: v6Bits("2804:14c", 30), record: SAO_PAULO },
];

describe("MmdbReader", () => {
  for (const size of [24, 28, 32] as const) {
    it(`reads ${size} bit records for IPv4 and IPv6`, () => {
      const reader = new MmdbReader(buildMmdb(entries, size));
      expect(reader.get("73.12.34.56")).toEqual(MIAMI);
      expect(reader.get("2a00:23c5:1234::1")).toEqual(LONDON);
      expect(reader.get("2804:14c:65:8000::9")).toEqual(SAO_PAULO);
      expect(reader.get("74.0.0.1")).toBeNull();
      expect(reader.get("2001:db8::1")).toBeNull();
    });
  }

  it("reads IPv4 mapped IPv6 and full form addresses", () => {
    const reader = new MmdbReader(buildMmdb(entries));
    expect(reader.get("::ffff:73.1.2.3")).toEqual(MIAMI);
    expect(reader.get("2a00:23c5:0000:0000:0000:0000:0000:0001")).toEqual(LONDON);
  });

  it("reads negative int32 values stored in fewer than four bytes", () => {
    const reader = new MmdbReader(
      buildMmdb([{ bits: v4Bits("73.0.0.0/8"), record: { metro_code: int32(-300) } }])
    );
    expect(reader.get("73.1.1.1")).toEqual({ metro_code: -300 });
  });

  it("reads metadata", () => {
    const reader = new MmdbReader(buildMmdb(entries));
    expect(reader.metadata).toMatchObject({
      ipVersion: 6,
      recordSize: 28,
      databaseType: "GeoLite2-City",
    });
    expect(reader.metadata.buildEpoch.getTime()).toBe(1_792_000_000 * 1000);
  });

  it("rejects files that are not a MaxMind DB", () => {
    expect(() => new MmdbReader(Buffer.from("not a database"))).toThrow();
  });

  it("returns null for anything that is not an IP address", () => {
    const reader = new MmdbReader(buildMmdb(entries));
    expect(reader.get("example.com")).toBeNull();
    expect(reader.get("")).toBeNull();
  });
});

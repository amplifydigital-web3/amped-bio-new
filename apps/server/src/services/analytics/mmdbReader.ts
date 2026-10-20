import { isIP } from "node:net";

/**
 * A small reader for MaxMind DB files (.mmdb, format 2.0), used for GeoLite2
 * City lookups. Implemented in house so the server does not take a new
 * dependency for one lookup. Covers the whole format: 24, 28 and 32 bit
 * records, IPv4 and IPv6 trees, pointers and every data type.
 *
 * Spec: https://maxmind.github.io/MaxMind-DB/
 */

const METADATA_MARKER = Buffer.from([0xab, 0xcd, 0xef, ...Buffer.from("MaxMind.com")]);
const DATA_SECTION_SEPARATOR = 16;

export type MmdbMetadata = {
  nodeCount: number;
  recordSize: number;
  ipVersion: number;
  databaseType: string;
  buildEpoch: Date;
};

type Decoded = { value: unknown; next: number };

class Decoder {
  constructor(
    private readonly db: Buffer,
    // Pointers are relative to this offset (the data section start)
    private readonly base: number
  ) {}

  decode(offset: number): Decoded {
    const ctrl = this.db[offset++];
    let type = ctrl >> 5;

    if (type === 1) return this.decodePointer(ctrl, offset);

    if (type === 0) {
      type = 7 + this.db[offset++];
    }

    let size = ctrl & 0x1f;
    if (size >= 29) {
      if (size === 29) {
        size = 29 + this.db[offset];
        offset += 1;
      } else if (size === 30) {
        size = 285 + this.db.readUInt16BE(offset);
        offset += 2;
      } else {
        size = 65821 + this.db.readUIntBE(offset, 3);
        offset += 3;
      }
    }

    return this.decodeByType(type, offset, size);
  }

  private decodePointer(ctrl: number, offset: number): Decoded {
    const pointerSize = ((ctrl >> 3) & 0x3) + 1;
    const vvv = ctrl & 0x7;
    let pointer: number;
    if (pointerSize === 1) pointer = (vvv << 8) | this.db[offset];
    else if (pointerSize === 2) pointer = ((vvv << 16) | this.db.readUInt16BE(offset)) + 2048;
    else if (pointerSize === 3) pointer = vvv * 0x1000000 + this.db.readUIntBE(offset, 3) + 526336;
    else pointer = this.db.readUInt32BE(offset);
    // The pointed value is decoded in place; reading continues after the pointer
    const { value } = this.decode(this.base + pointer);
    return { value, next: offset + pointerSize };
  }

  private decodeByType(type: number, offset: number, size: number): Decoded {
    switch (type) {
      case 2: // UTF-8 string
        return { value: this.db.toString("utf8", offset, offset + size), next: offset + size };
      case 3: // double
        return { value: this.db.readDoubleBE(offset), next: offset + 8 };
      case 4: // bytes
        return { value: this.db.subarray(offset, offset + size), next: offset + size };
      case 5: // uint16
      case 6: // uint32
        return { value: this.readUInt(offset, size), next: offset + size };
      case 7: {
        // map
        const map: Record<string, unknown> = {};
        let next = offset;
        for (let i = 0; i < size; i++) {
          const key = this.decode(next);
          const value = this.decode(key.next);
          map[String(key.value)] = value.value;
          next = value.next;
        }
        return { value: map, next };
      }
      case 8: {
        // int32, stored in 0 to 4 bytes. Negative values are two's complement
        // over the bytes actually stored, so the sign comes from the first one.
        if (size === 0) return { value: 0, next: offset };
        const padded = Buffer.alloc(4, this.db[offset] & 0x80 ? 0xff : 0);
        this.db.copy(padded, 4 - size, offset, offset + size);
        return { value: padded.readInt32BE(0), next: offset + size };
      }
      case 9: // uint64
      case 10: // uint128
        return { value: this.readBigUInt(offset, size), next: offset + size };
      case 11: {
        // array
        const array: unknown[] = [];
        let next = offset;
        for (let i = 0; i < size; i++) {
          const item = this.decode(next);
          array.push(item.value);
          next = item.next;
        }
        return { value: array, next };
      }
      case 14: // boolean, the value is the size
        return { value: size !== 0, next: offset };
      case 15: // float
        return { value: this.db.readFloatBE(offset), next: offset + 4 };
      default:
        throw new Error(`Unsupported MaxMind DB data type ${type}`);
    }
  }

  private readUInt(offset: number, size: number): number {
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + this.db[offset + i];
    return value;
  }

  private readBigUInt(offset: number, size: number): bigint {
    let value = 0n;
    for (let i = 0; i < size; i++) value = (value << 8n) | BigInt(this.db[offset + i]);
    return value;
  }
}

function ipToBits(ip: string): { bytes: Buffer; bitCount: number } | null {
  const version = isIP(ip);
  if (version === 4) {
    return { bytes: Buffer.from(ip.split(".").map(Number)), bitCount: 32 };
  }
  if (version !== 6) return null;

  // Expand "::" and any embedded IPv4 tail into 8 groups
  let address = ip;
  const v4Tail = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const [a, b, c, d] = v4Tail[1].split(".").map(Number);
    address =
      address.slice(0, -v4Tail[1].length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups =
    tail === undefined ? headGroups : [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  const bytes = Buffer.alloc(16);
  groups.forEach((group, i) => bytes.writeUInt16BE(parseInt(group || "0", 16), i * 2));
  return { bytes, bitCount: 128 };
}

export class MmdbReader {
  readonly metadata: MmdbMetadata;
  private readonly searchTreeSize: number;
  private readonly dataSectionStart: number;
  private readonly decoder: Decoder;
  private readonly ipv4Start: number;

  constructor(private readonly db: Buffer) {
    const markerAt = db.lastIndexOf(METADATA_MARKER);
    if (markerAt < 0) throw new Error("Not a MaxMind DB file");
    const metadataStart = markerAt + METADATA_MARKER.length;
    const raw = new Decoder(db, metadataStart).decode(metadataStart).value as Record<
      string,
      unknown
    >;

    this.metadata = {
      nodeCount: Number(raw.node_count),
      recordSize: Number(raw.record_size),
      ipVersion: Number(raw.ip_version),
      databaseType: String(raw.database_type ?? ""),
      buildEpoch: new Date(Number(raw.build_epoch) * 1000),
    };
    if (![24, 28, 32].includes(this.metadata.recordSize)) {
      throw new Error(`Unsupported MaxMind DB record size ${this.metadata.recordSize}`);
    }

    this.searchTreeSize = ((this.metadata.recordSize * 2) / 8) * this.metadata.nodeCount;
    this.dataSectionStart = this.searchTreeSize + DATA_SECTION_SEPARATOR;
    this.decoder = new Decoder(db, this.dataSectionStart);

    // IPv4 addresses live under ::/96 in an IPv6 tree
    let node = 0;
    if (this.metadata.ipVersion === 6) {
      for (let i = 0; i < 96 && node < this.metadata.nodeCount; i++) {
        node = this.readNode(node, 0);
      }
    }
    this.ipv4Start = node;
  }

  private readNode(node: number, bit: 0 | 1): number {
    const size = this.metadata.recordSize;
    const offset = node * ((size * 2) / 8);
    if (size === 24) return this.db.readUIntBE(offset + bit * 3, 3);
    if (size === 32) return this.db.readUInt32BE(offset + bit * 4);
    // 28 bit records share the middle byte's two nibbles
    const middle = this.db[offset + 3];
    return bit === 0
      ? ((middle & 0xf0) << 20) | this.db.readUIntBE(offset, 3)
      : ((middle & 0x0f) << 24) | this.db.readUIntBE(offset + 4, 3);
  }

  /** The record for an IP address, or null when the database has none. */
  get<T = Record<string, unknown>>(ip: string): T | null {
    // IPv4 mapped IPv6 (::ffff:1.2.3.4) is looked up as the IPv4 address
    const parsed = ipToBits(ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, ""));
    if (!parsed) return null;
    const { nodeCount } = this.metadata;
    if (parsed.bitCount === 128 && this.metadata.ipVersion === 4) return null;

    let node = parsed.bitCount === 32 ? this.ipv4Start : 0;
    for (let i = 0; i < parsed.bitCount && node < nodeCount; i++) {
      const bit = ((parsed.bytes[i >> 3] >> (7 - (i % 8))) & 1) as 0 | 1;
      node = this.readNode(node, bit);
    }

    if (node === nodeCount) return null; // no data for this address
    if (node < nodeCount) return null; // tree deeper than the address, not expected
    const offset = node - nodeCount - DATA_SECTION_SEPARATOR + this.dataSectionStart;
    if (offset >= this.db.length) throw new Error("Corrupt MaxMind DB search tree");
    return this.decoder.decode(offset).value as T;
  }
}

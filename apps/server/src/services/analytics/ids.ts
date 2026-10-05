import { uuidv7 } from "../../utils/uuid-v7";

/**
 * Identifiers for the creator analytics entities. They are UUID v7 values stored
 * as BINARY(16) (see AGENTS.md: all new entities use UUID v7 primary keys), and
 * exposed to clients as a lowercase 32 character hex string.
 */
export function newAnalyticsId(): Buffer {
  return uuidv7();
}

export function idToHex(id: Buffer | Uint8Array): string {
  return Buffer.from(id).toString("hex");
}

export function hexToId(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

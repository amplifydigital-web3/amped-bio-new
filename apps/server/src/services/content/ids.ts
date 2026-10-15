import { randomBytes } from "node:crypto";
import {
  CONTENT_PUBLIC_ID_ALPHABET,
  CONTENT_PUBLIC_ID_LENGTH,
  type ContentKindName,
} from "@repo/constants";
import type { ContentKind } from "@repo/database";

/**
 * Random public id (spec 3.3): 16 characters from a to z and 0 to 9. Rejection
 * sampling keeps every character equally likely (252 is the largest multiple of 36
 * below 256).
 */
export function newContentPublicId(): string {
  const alphabet = CONTENT_PUBLIC_ID_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < CONTENT_PUBLIC_ID_LENGTH) {
    for (const byte of randomBytes(32)) {
      if (byte < limit) out += alphabet[byte % alphabet.length];
      if (out.length === CONTENT_PUBLIC_ID_LENGTH) break;
    }
  }
  return out;
}

export function toDbKind(kind: ContentKindName): ContentKind {
  return kind.toUpperCase() as ContentKind;
}

export function fromDbKind(kind: ContentKind): ContentKindName {
  return kind.toLowerCase() as ContentKindName;
}

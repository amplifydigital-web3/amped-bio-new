import * as ed from "@noble/ed25519";
import { createHash } from "crypto";
import yaml from "yaml";
import {
  createNdauConversionPayloadYaml as createSharedNdauConversionPayloadYaml,
  NDAU_TO_REVO_RATE,
} from "@ampedbio/constants";

const NDAU_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function base36Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const idx = NDAU_ALPHABET.indexOf(c);
    if (idx < 0) {
      throw new Error(`Invalid character in ndau address: ${c}`);
    }
    n = n * 36n + BigInt(idx);
  }
  const hex = n.toString(16);
  const padded = hex.length % 2 === 0 ? hex : "0" + hex;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

interface NdauDecodedAddress {
  version: number;
  data: Uint8Array;
}

function decodeNdauAddress(encoded: string): NdauDecodedAddress {
  const bytes = base36Decode(encoded);
  if (bytes.length < 2) {
    throw new Error("Invalid ndau address: too short");
  }
  return {
    version: bytes[0],
    data: bytes.slice(1),
  };
}

interface NdauSignatureParsed {
  algorithm: string;
  data: Uint8Array;
}

function parseNdauSignature(encoded: string): NdauSignatureParsed {
  const { data } = decodeNdauAddress(encoded);
  return decodeMsgpackSignature(data);
}

interface NdauPublicKeyParsed {
  algorithm: string;
  key: Uint8Array;
}

function parseNdauPublicKey(encoded: string): NdauPublicKeyParsed {
  const { data } = decodeNdauAddress(encoded);
  return decodeMsgpackPublicKey(data);
}

function decodeMsgpackSignature(data: Uint8Array): NdauSignatureParsed {
  let offset = 0;

  const firstByte = data[offset++];

  if (firstByte === 0x82) {
    const { value: algo, offset: o1 } = readMsgpackString(data, offset);
    offset = o1;
    const { value: sigData, offset: o2 } = readMsgpackBinary(data, offset);
    offset = o2;
    return { algorithm: algo, data: sigData };
  }

  if (firstByte === 0x92) {
    const { value: algo, offset: o1 } = readMsgpackString(data, offset);
    offset = o1;
    const { value: sigData, offset: o2 } = readMsgpackBinary(data, offset);
    offset = o2;
    return { algorithm: algo, data: sigData };
  }

  throw new Error(`Unexpected msgpack format for signature: 0x${firstByte.toString(16)}`);
}

function decodeMsgpackPublicKey(data: Uint8Array): NdauPublicKeyParsed {
  let offset = 0;

  const firstByte = data[offset++];

  if (firstByte === 0x82) {
    const { value: algo, offset: o1 } = readMsgpackString(data, offset);
    offset = o1;
    const { value: keyData, offset: o2 } = readMsgpackBinary(data, offset);
    offset = o2;
    return { algorithm: algo, key: keyData };
  }

  if (firstByte === 0x92) {
    const { value: algo, offset: o1 } = readMsgpackString(data, offset);
    offset = o1;
    const { value: keyData, offset: o2 } = readMsgpackBinary(data, offset);
    offset = o2;
    return { algorithm: algo, key: keyData };
  }

  throw new Error(`Unexpected msgpack format for public key: 0x${firstByte.toString(16)}`);
}

function readMsgpackString(data: Uint8Array, offset: number): { value: string; offset: number } {
  const byte = data[offset++];

  if (byte >= 0xa0 && byte <= 0xbf) {
    const len = byte & 0x1f;
    const str = Buffer.from(data.slice(offset, offset + len)).toString("utf-8");
    return { value: str, offset: offset + len };
  }

  if (byte === 0xd9) {
    const len = data[offset++];
    const str = Buffer.from(data.slice(offset, offset + len)).toString("utf-8");
    return { value: str, offset: offset + len };
  }

  if (byte === 0xda) {
    const len = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    const str = Buffer.from(data.slice(offset, offset + len)).toString("utf-8");
    return { value: str, offset: offset + len };
  }

  throw new Error(`Unexpected msgpack string format: 0x${byte.toString(16)}`);
}

function readMsgpackBinary(
  data: Uint8Array,
  offset: number
): { value: Uint8Array; offset: number } {
  const byte = data[offset++];

  if (byte === 0xc4) {
    const len = data[offset++];
    const bin = data.slice(offset, offset + len);
    return { value: bin, offset: offset + len };
  }

  if (byte === 0xc5) {
    const len = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    const bin = data.slice(offset, offset + len);
    return { value: bin, offset: offset + len };
  }

  if (byte === 0xc6) {
    const len =
      (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    offset += 4;
    const bin = data.slice(offset, offset + len);
    return { value: bin, offset: offset + len };
  }

  throw new Error(`Unexpected msgpack binary format: 0x${byte.toString(16)}`);
}

export async function verifyNdauSignature(
  signatureEncoded: string,
  payloadBase64: string,
  publicKeyEncoded: string
): Promise<boolean> {
  try {
    const sig = parseNdauSignature(signatureEncoded);
    const pk = parseNdauPublicKey(publicKeyEncoded);

    const originalPayload = Buffer.from(payloadBase64, "base64");

    if (sig.algorithm === "Ed25519" && pk.algorithm === "Ed25519") {
      const payloadBytes = new Uint8Array(originalPayload);
      return await ed.verify(sig.data, payloadBytes, pk.key);
    }

    if (sig.algorithm === "Secp256k1" && pk.algorithm === "Secp256k1") {
      const bytePayload = new Uint8Array(originalPayload);
      const hashPayload = createHash("sha256").update(bytePayload).digest();
      const { schnorr } = await import("@noble/secp256k1");
      return schnorr.verify(sig.data, hashPayload, pk.key);
    }

    throw new Error(
      `Unsupported or mismatched signature algorithms: sig=${sig.algorithm}, key=${pk.algorithm}`
    );
  } catch (error) {
    console.error("NDAU signature verification error:", error);
    return false;
  }
}

export async function verifyConversionSignature(
  ndauSignature: string,
  ndauAddress: string,
  revoAddress: string,
  ndauValidationKey: string,
  ndauAmount: string,
  revoAmount: string,
  ndauTimestamp: number,
  documentHash: string
): Promise<{
  isValid: boolean;
  algorithm?: string;
  error?: string;
}> {
  try {
    if (!ndauValidationKey) {
      return { isValid: false, error: "No validation key stored for this conversion" };
    }

    const sig = parseNdauSignature(ndauSignature);

    const payloadYaml = createSharedNdauConversionPayloadYaml({
      ndauAddress,
      revoAddress,
      ndauValidationKey,
      ndauAmount,
      revoAmount,
      timestamp: ndauTimestamp,
      documentHash,
    });

    const payloadBase64 = Buffer.from(payloadYaml).toString("base64");

    const isValid = await verifyNdauSignature(ndauSignature, payloadBase64, ndauValidationKey);

    return {
      isValid,
      algorithm: sig.algorithm,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown verification error";
    return { isValid: false, error: message };
  }
}

import * as ed from "@noble/ed25519";
import { createHash } from "crypto";
import {
  createWalletBallotYaml,
} from "@ampedbio/constants";

const NDAU_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function derToCompact(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error("Not a DER signature");
  let offset = 2;
  if (der[offset] !== 0x02) throw new Error("Expected 0x02 for r");
  offset++;
  const rLen = der[offset];
  offset++;
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset] !== 0x02) throw new Error("Expected 0x02 for s");
  offset++;
  const sLen = der[offset];
  offset++;
  const s = der.slice(offset, offset + sLen);
  const compact = new Uint8Array(64);
  compact.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
  compact.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));
  return compact;
}

function b32Decode(str: string): Uint8Array {
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = new Uint8Array(Math.ceil(str.length * 5 / 8));
  for (let i = 0; i < str.length; i++) {
    const charIndex = NDAU_ALPHABET.indexOf(str[i].toLowerCase());
    if (charIndex === -1) throw new Error(`Invalid base32 character: ${str[i]}`);
    value = (value << 5) | charIndex;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = (value >>> bits) & 255;
    }
  }
  return output.slice(0, index);
}

const SIZE_224 = 28;
function cksumN(input: Uint8Array, n: number): Uint8Array {
  const sum = createHash("sha224").update(input).digest();
  return new Uint8Array(sum).slice(SIZE_224 - n);
}

function checkChecksum(checked: Uint8Array): { message: Uint8Array; valid: boolean } {
  if (checked.length < 4) return { message: new Uint8Array(), valid: false };
  const n = checked[0];
  const last = checked.length - n;
  if (last < 1) return { message: new Uint8Array(), valid: false };
  const message = checked.slice(1, last);
  const sumActual = checked.slice(last);
  const sumExpect = cksumN(message, n);
  return {
    message,
    valid: Buffer.from(sumActual).compare(Buffer.from(sumExpect)) === 0,
  };
}

function unmarshalMsg(bts: Uint8Array): { algorithm: string; data: Uint8Array } {
  if (bts.length < 1) throw new Error("too few bytes");
  let zb0001: number | undefined;
  const lead = bts[0];
  if ((lead & 0xf0) === 0x90) {
    zb0001 = lead & 0x0f;
    bts = bts.slice(1);
  }
  if (zb0001 !== 2) throw new Error(`Wanted fixarray(2), Got: ${zb0001}`);
  const algoId = bts[0] & 0xff;
  bts = bts.slice(1);
  const algorithmMap: Record<number, string> = { 1: "Ed25519", 2: "Secp256k1" };
  const algorithm = algorithmMap[algoId];
  if (!algorithm) throw new Error(`Unknown algorithm: ${algoId}`);
  if (bts[0] !== 0xc4) throw new Error(`Expected bin8, got: 0x${bts[0].toString(16)}`);
  const dataLen = bts[1];
  bts = bts.slice(2);
  if (bts.length < dataLen) throw new Error("too few bytes for data");
  return { algorithm, data: bts.slice(0, dataLen) };
}

function unpack(data: Uint8Array): { key: Uint8Array; extra: Uint8Array } {
  if (data.length === 0) throw new Error("empty data");
  const lk = data[0];
  const split = 1 + lk;
  if (data.length < split) throw new Error("too few bytes");
  return { key: data.slice(1, split), extra: data.slice(split) };
}

function unmarshal(serialized: Uint8Array): { algorithm: string; data: Uint8Array } {
  const { algorithm, data } = unmarshalMsg(serialized);
  return { algorithm, data };
}

function parseNdauPublicKey(npub: string): { algorithm: string; key: Uint8Array } {
  if (!npub.startsWith("npub")) throw new Error("must start with npub");
  const bytes = b32Decode(npub.slice(4));
  const { message, valid } = checkChecksum(bytes);
  if (!valid) throw new Error("bad checksum");
  const { algorithm, data } = unmarshal(message);
  const { key } = unpack(data);
  return { algorithm, key };
}

function parseNdauSignature(sig: string): { algorithm: string; data: Uint8Array } {
  const bytes = b32Decode(sig);
  const { message, valid } = checkChecksum(bytes);
  if (!valid) throw new Error("bad checksum");
  return unmarshal(message);
}

export async function verifyNdauSignature(
  signatureEncoded: string,
  payloadBase64: string,
  publicKeyEncoded: string
): Promise<boolean> {
  try {
    console.log("[NDAU-SIG-VERIFY] verifyNdauSignature called", {
      sigPreview: signatureEncoded.substring(0, 30) + "...",
      payloadLen: payloadBase64.length,
      pkPreview: publicKeyEncoded.substring(0, 30) + "...",
    });

    const sig = parseNdauSignature(signatureEncoded);
    const pk = parseNdauPublicKey(publicKeyEncoded);

    console.log("[NDAU-SIG-VERIFY] sig:", sig.algorithm, sig.data.length, "bytes");
    console.log("[NDAU-SIG-VERIFY] pk:", pk.algorithm, pk.key.length, "bytes");

    const originalPayload = Buffer.from(payloadBase64, "base64");
    console.log("[NDAU-SIG-VERIFY] payload decoded:", originalPayload.length, "bytes");

    if (sig.algorithm === "Ed25519" && pk.algorithm === "Ed25519") {
      const hexPayload = originalPayload.toString("hex");
      return await ed.verify(sig.data, hexPayload as unknown as Uint8Array, pk.key);
    }

    if (sig.algorithm === "Secp256k1" && pk.algorithm === "Secp256k1") {
      const bytePayload = new Uint8Array(Buffer.from(originalPayload.toString("binary"), "binary"));
      const compactSig = derToCompact(sig.data);
      console.log("[NDAU-SIG-VERIFY] compact sig:", Buffer.from(compactSig).toString("hex").substring(0, 40) + "...");
      const secp256k1 = await import("@noble/secp256k1");
      secp256k1.hashes.sha256 = (msg: Uint8Array) => createHash("sha256").update(msg).digest();
      return secp256k1.verify(compactSig, bytePayload, pk.key);
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

    console.log("[NDAU-SIG-VERIFY] verifyConversionSignature called", {
      sigPreview: ndauSignature.substring(0, 30) + "...",
      ndauAddress,
      revoAddress,
      pkPreview: ndauValidationKey.substring(0, 30) + "...",
      ndauAmount,
      revoAmount,
      ndauTimestamp,
      documentHash,
    });

    const payloadYaml = createWalletBallotYaml({
      ndauAddress,
      revoAddress,
      ndauValidationKey,
      ndauAmount,
      revoAmount,
      timestamp: ndauTimestamp,
      documentHash,
    });

    console.log("[NDAU-SIG-VERIFY] payloadYaml:", payloadYaml);

    const payloadBase64 = Buffer.from(payloadYaml).toString("base64");

    console.log("[NDAU-SIG-VERIFY-JSON]", JSON.stringify({
      ndauAddress,
      ndauAccount: ndauValidationKey,
      revoAddress,
      ndauAmount,
      revoAmount,
      timestamp: ndauTimestamp,
      documentHash,
      signature: ndauSignature,
      payloadYaml,
      payloadBase64,
    }, null, 2));

    const isValid = await verifyNdauSignature(ndauSignature, payloadBase64, ndauValidationKey);
    console.log("[NDAU-SIG-VERIFY] result:", isValid);

    return {
      isValid,
      algorithm: isValid ? "verified" : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown verification error";
    console.error("[NDAU-SIG-VERIFY] error:", message);
    return { isValid: false, error: message };
  }
}

import * as secp256k1 from "@noble/secp256k1";
import * as ed25519 from "@noble/ed25519";
import {
  type NdauConversionPayload,
  createNdauConversionPayload as createSharedNdauConversionPayload,
} from "@ampedbio/constants";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32Decode(str: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const output = new Uint8Array(((str.length * 5) / 8) | 0);
  let index = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.toLowerCase();
    const charIndex = BASE32_ALPHABET.indexOf(char);

    if (charIndex === -1) {
      throw new Error("Invalid base32 character");
    }

    value = (value << 5) | charIndex;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      output[index++] = (value >>> bits) & 255;
    }
  }

  return output;
}

function parseNdauPublicKey(ndauPubkey: string) {
  const withoutPrefix = ndauPubkey.slice(4);
  const decoded = base32Decode(withoutPrefix);

  const algorithm = decoded[1];
  const keyData = decoded.slice(2, -4);

  return {
    algorithm: algorithm === 0 ? "Ed25519" : "Secp256k1",
    keyData: keyData,
  };
}

function parseNdauSignature(ndauSignature: string) {
  const withoutPrefix = ndauSignature.slice(2);
  const decoded = base32Decode(withoutPrefix);

  const algorithm = decoded[0];
  const signatureData = decoded.slice(1, -4);

  return {
    algorithm: algorithm === 0 ? "Ed25519" : "Secp256k1",
    signatureData: signatureData,
  };
}

export function createNdauConversionPayload(
  ndauAddress: string,
  revoAddress: string,
  ndauValidationKey: string,
  ndauAmount: string,
  revoAmount: string,
  timestamp: number,
  documentHash: string
): NdauConversionPayload {
  return createSharedNdauConversionPayload({
    ndauAddress,
    revoAddress,
    ndauValidationKey,
    ndauAmount,
    revoAmount,
    timestamp,
    documentHash,
  });
}

export async function verifyNdauSignature(
  payloadYaml: string,
  signature: string,
  ndauAccount: string
): Promise<boolean> {
  try {
    const pubKeyInfo = parseNdauPublicKey(ndauAccount);
    const sigInfo = parseNdauSignature(signature);

    if (pubKeyInfo.algorithm !== sigInfo.algorithm) {
      return false;
    }

    const payloadBytes = new TextEncoder().encode(payloadYaml);

    let isValid = false;

    if (pubKeyInfo.algorithm === "Ed25519") {
      isValid = await ed25519.verify(sigInfo.signatureData, payloadBytes, pubKeyInfo.keyData);
    } else {
      const hashBuffer = await crypto.subtle.digest("SHA-256", payloadBytes);
      const hash = new Uint8Array(hashBuffer);
      isValid = await secp256k1.verify(sigInfo.signatureData, hash, pubKeyInfo.keyData);
    }

    return isValid;
  } catch (error) {
    console.error("Error verifying ndau signature:", error);
    return false;
  }
}

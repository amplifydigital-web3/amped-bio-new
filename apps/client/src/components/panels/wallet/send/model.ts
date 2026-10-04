import { isAddress, type Address } from "viem";

// Screen Review 062 to 064: shared pieces of the Send flow.

export type Recipient = {
  address: Address;
  name?: string | null;
  handle?: string | null;
  avatar?: string | null;
};

// Person first, then the address as 6 plus 4 characters
export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function recipientTitle(recipient: Recipient) {
  return (
    recipient.name || (recipient.handle ? `@${recipient.handle}` : shortAddress(recipient.address))
  );
}

export function recipientLine(recipient: Recipient) {
  return recipient.handle
    ? `@${recipient.handle} · ${shortAddress(recipient.address)}`
    : shortAddress(recipient.address);
}

// Only http(s) image URLs render as avatars; anything else falls back to initials
export function avatarUrl(value?: string | null) {
  return value && /^https?:\/\//.test(value) ? value : null;
}

export function sameAddress(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * 063 I03: a scan is a bare 0x address or an ethereum: payment link. The
 * scheme, any @chainId and any query are stripped. For EIP-681 token links
 * (ethereum:<token>@<chain>/transfer?address=<recipient>), extracts the
 * `address=` parameter instead of the token contract.
 */
export function parseScannedAddress(raw: string): Address | null {
  let value = raw.trim();
  if (/^ethereum:/i.test(value)) value = value.slice("ethereum:".length);
  if (/^pay-/i.test(value)) value = value.slice(4);
  // EIP-681: a path means a token transfer — extract the recipient from query
  const pathIndex = value.search(/[/?#]/);
  if (pathIndex !== -1) {
    const before = value.slice(0, pathIndex);
    const after = value.slice(pathIndex);
    // Split on @ for chainId: ethereum:<token>@<chainId>/transfer?address=...
    const tokenAddr = before.split("@")[0];
    // If the path contains /transfer, look for address= in the query
    if (/\/transfer/i.test(after)) {
      const qIndex = after.indexOf("?");
      if (qIndex !== -1) {
        const params = new URLSearchParams(after.slice(qIndex));
        const recipient = params.get("address");
        if (recipient && isAddress(recipient, { strict: false }))
          return recipient as Address;
      }
    }
    // Not a recognized function path — return the base address (bare ETH send)
    value = tokenAddr;
  }
  return isAddress(value, { strict: false }) ? (value as Address) : null;
}

export function timeAgo(value: string | number | Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, unit] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

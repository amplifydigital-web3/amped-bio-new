import { bytesToHex, Hex, numberToBytes } from "viem";
import { format, formatDistanceToNow, addDays, fromUnixTime, isValid } from "date-fns";
import { DOMAIN_SUFFIX, NAME_REQUIREMENTS } from "@/config/rns/constants";

export interface FormattedDateTime {
  date: string;
  time: string;
  timestamp: number;
  relative: string;
}

export type scannerType = "nft" | "address" | "tx";

export const domainName = (name: string) => {
  return `${name}${DOMAIN_SUFFIX}`;
};

export const trimmedDomainName = (name: string): string => {
  const trimmedName = name.length > 15 ? `${name.slice(0, 15)}...` : name;
  return `${trimmedName}${DOMAIN_SUFFIX}`;
};

export const formatDateTime = (timestamp: number): FormattedDateTime => {
  const date = fromUnixTime(timestamp);
  const dt = isValid(date) ? date : new Date();

  return {
    date: format(dt, "MMM d, yyyy"),
    time: format(dt, "HH:mm:ss xxx"),
    timestamp,
    relative: formatDistanceToNow(dt, { addSuffix: true }),
  };
};

export const calculateNewExpiryDate = (duration: bigint, expiry: bigint | undefined): string => {
  const durationInDays = Number(duration) / (24 * 60 * 60);
  const expiryDate = expiry && expiry !== BigInt(0) ? fromUnixTime(Number(expiry)) : new Date();

  return format(addDays(expiryDate, durationInDays), "MMMM d, yyyy");
};

export const scannerURL = (type: scannerType, hash: string, blockExplorerUrl?: string): string => {
  const baseUrl = blockExplorerUrl || "https://libertas.revoscan.io";
  return `${baseUrl}/${type}/${hash}`;
};

export const nftIdToBytes32 = (id: bigint): Hex => {
  return bytesToHex(numberToBytes(id));
};

export const isValidRevolutionName = (name: string): boolean => {
  if (
    name.length >= NAME_REQUIREMENTS.minLength &&
    name.length <= NAME_REQUIREMENTS.maxLength &&
    NAME_REQUIREMENTS.validCharacters.test(name)
  ) {
    return true;
  }
  return false;
};

export const isRevoNameExpired = (expiryDateWithGrace: string): boolean => {
  const currentTime = Math.floor(Date.now() / 1000);
  const expiresTime = Number(expiryDateWithGrace);

  if (expiresTime < currentTime) return true;

  return false;
};

export const smoothScrollTo = (target: number, duration = 300, container?: HTMLElement) => {
  const start = container ? container.scrollTop : window.scrollY;
  const distance = target - start;
  let startTime: number | null = null;
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
  const step = (ts: number) => {
    if (!startTime) startTime = ts;
    const progress = Math.min((ts - startTime) / duration, 1);
    const position = start + distance * ease(progress);
    if (container) {
      container.scrollTop = position;
    } else {
      window.scrollTo(0, position);
    }
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

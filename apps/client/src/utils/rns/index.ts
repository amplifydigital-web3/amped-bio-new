import { DateTime } from "luxon";
import { bytesToHex, Hex, numberToBytes } from "viem";
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
  const date = DateTime.fromSeconds(timestamp);
  const dt = date.isValid ? date : DateTime.now();

  return {
    date: dt.toLocaleString({ month: "short", day: "numeric", year: "numeric" }),
    time: dt.toLocaleString(DateTime.TIME_WITH_SHORT_OFFSET),
    timestamp,
    relative: dt.toRelative() || "",
  };
};

export const calculateNewExpiryDate = (duration: bigint, expiry: bigint | undefined): string => {
  const durationInDays = Number(duration) / (24 * 60 * 60);
  const expiryDate =
    expiry && expiry !== BigInt(0) ? DateTime.fromSeconds(Number(expiry)) : DateTime.now();

  return expiryDate.plus({ days: durationInDays }).toLocaleString(DateTime.DATE_FULL);
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

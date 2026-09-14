/**
 * Truncates a blockchain address to show a specified number of characters at the start and end
 *
 * @param address The blockchain address to truncate
 * @param startChars Number of characters to show at the start
 * @param endChars Number of characters to show at the end
 * @returns The truncated address string
 */
export function truncateAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (!address) return "";
  if (address.length <= startChars + endChars) return address;

  const start = address.substring(0, startChars);
  const end = address.substring(address.length - endChars);

  return `${start}...${end}`;
}

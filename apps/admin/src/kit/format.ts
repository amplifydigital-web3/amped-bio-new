// Shared admin formatting (Screen Review 087 to 094). Addresses and hashes
// show 6 plus 4, numbers are en-US with grouping, dates read 27 Sep 2026.

/** 0x7a3F…c91E. Short values come back unchanged. */
export function shortHex(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatCount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 27 Sep 2026 */
export function formatDay(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** 27 Sep, 16:40 */
export function formatDayTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${time}`;
}

/** k…@proton.me: the first letter and the domain (087 I15). */
export function maskEmailShort(email: string | null | undefined): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!user || !domain) return "…";
  return `${user[0]}…@${domain}`;
}

/** File sizes in words: 640 KB, 1.8 MB. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

type CsvCell = string | number | null | undefined;

function escapeCsv(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const text = String(cell);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a CSV file in the browser and starts the download. */
export function downloadCsv(fileName: string, header: string[], rows: CsvCell[][]): void {
  const content = [header, ...rows].map(row => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Public page address for a handle on the landing site. */
export function publicPageUrl(handle: string): string {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/@${handle.replace(/^@/, "")}`;
}

// 089 I05, I13: a transaction hash is 0x and 64 hex characters
export const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
export const TX_HASH_ERROR = "Paste a 66 character hash that starts with 0x.";

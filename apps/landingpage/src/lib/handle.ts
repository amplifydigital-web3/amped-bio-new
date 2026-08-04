export function normalizeHandle(handle: string): string {
  if (!handle) return "";
  let normalized = handle.trim();
  if (normalized.startsWith("@")) {
    normalized = normalized.substring(1);
  }
  return normalized.toLowerCase();
}

export function formatHandle(handle: string): string {
  if (!handle) return "";
  const normalized = normalizeHandle(handle);
  return `@${normalized}`;
}

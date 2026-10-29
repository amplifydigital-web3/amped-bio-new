import { prisma } from "../services/DB";
import { fanHandleBase } from "../services/follow/rules";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, generatedHandleBase } from "@repo/constants";
import { matchReserved, reservedRowsForGenerators } from "../services/reservedHandles";

/**
 * Extracts handle from email: part before "@", removes alias (before "+"), and removes dots
 */
export function extractHandleFromEmail(email: string): string {
  const localPart = email.split("@")[0]; // Get part before "@"
  if (!localPart) return "";
  const handleWithoutAlias = localPart.split("+")[0]; // Remove alias part after "+"
  return handleWithoutAlias.replace(/\./g, "") || ""; // Remove all dots
}

/**
 * Checks if a handle (littlelink name) is available
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { handle: handle },
          { handle: handle.toLowerCase() },
          { handle: handle.toUpperCase() },
        ],
      },
      select: { id: true },
    });
    return !existingUser;
  } catch (error) {
    console.error("Error checking handle availability:", error);
    return false;
  }
}

/**
 * Reserved handles (Build Board D2, spec 4.6): a generated handle must be free
 * and must not be reserved. The final handle is checked, not the base.
 */
async function isHandleUsable(handle: string): Promise<boolean> {
  if ((await matchReserved(handle)).reserved) return false;
  return isHandleAvailable(handle);
}

/** The base a generated handle starts from, with any reserved prefix removed. */
async function safeBase(raw: string): Promise<string> {
  return generatedHandleBase(raw, await reservedRowsForGenerators(), {
    minLength: HANDLE_MIN_LENGTH,
    maxLength: HANDLE_MAX_LENGTH,
  });
}

/**
 * Generates a unique handle by appending random numbers if needed
 */
export async function generateUniqueHandle(rawBase: string): Promise<string> {
  const baseHandle = await safeBase(rawBase);
  let handle = baseHandle;
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    if (await isHandleUsable(handle)) {
      return handle;
    }

    // If not available, append random number
    const randomSuffix = Math.floor(Math.random() * 10000);
    handle = `${baseHandle}${randomSuffix}`;
    attempts++;
  }

  // If we can't find an available handle after many attempts, use timestamp
  return `${baseHandle}${Date.now()}`;
}

/**
 * Processes email to generate a unique handle
 */
export async function processEmailToUniqueHandle(email: string): Promise<string> {
  const baseHandle = extractHandleFromEmail(email);
  return await generateUniqueHandle(baseHandle);
}

export async function generateFanHandle(name: string | null | undefined): Promise<string> {
  // fanHandleBase gives "fan" when the name has nothing usable; keep that word
  const fromName = fanHandleBase(name);
  const cleaned = await safeBase(fromName);
  let base = cleaned === "user" ? "fan" : cleaned;
  // The hyphen joins a reserved prefix when the name is that prefix's word
  // ("Amped" would give amped-4821, under amped-), so fall back to "fan"
  if ((await matchReserved(`${base}-1000`)).reserved) base = "fan";
  for (let attempt = 0; attempt < 20; attempt++) {
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const handle = `${base}-${digits}`;
    if (await isHandleUsable(handle)) return handle;
  }
  return `${base}-${Date.now()}`;
}

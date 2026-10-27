import { prisma } from "../services/DB";

/**
 * Extracts handle from email: part before "@", removes alias (before "+"), and removes dots
 */
export function extractHandleFromEmail(email: string): string {
  const localPart = email.split("@")[0]; // Get part before "@"
  if (!localPart) return "";
  const handleWithoutAlias = localPart.split("+")[0] ?? ""; // Remove alias part after "+"
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
 * Generates a unique handle by appending random numbers if needed
 */
export async function generateUniqueHandle(baseHandle: string): Promise<string> {
  let handle = baseHandle;
  let attempts = 0;

  while (!(await isHandleAvailable(handle))) {
    attempts++;
    if (attempts > 10) {
      // Fallback: use a random 6-digit number
      handle = `${baseHandle}${Math.floor(100000 + Math.random() * 900000)}`;
      break;
    }
    handle = `${baseHandle}${Math.floor(1000 + Math.random() * 9000)}`;
  }

  return handle;
}

/**
 * Processes email to create a unique handle (littlelink name)
 */
export async function processEmailToUniqueHandle(email: string): Promise<string> {
  const baseHandle = extractHandleFromEmail(email);
  if (!baseHandle) {
    // Fallback: generate a random handle
    return `user${Math.floor(100000 + Math.random() * 900000)}`;
  }

  return generateUniqueHandle(baseHandle);
}
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Extracts handle from email: part before "@" and removes alias (before "+")
 */
export function extractHandleFromEmail(email: string): string {
  const localPart = email.split("@")[0]; // Get part before "@"
  const handleWithoutAlias = localPart.split("+")[0]; // Remove alias part after "+"
  return handleWithoutAlias;
}

/**
 * Checks if a handle (littlelink name) is available
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { handle },
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
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const isAvailable = await isHandleAvailable(handle);

    if (isAvailable) {
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

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
 * Checks if a onelink (littlelink name) is available
 */
export async function isOnelinkAvailable(onelink: string): Promise<boolean> {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { onelink },
      select: { id: true },
    });
    return !existingUser;
  } catch (error) {
    console.error("Error checking onelink availability:", error);
    return false;
  }
}

/**
 * Generates a unique onelink by appending random numbers if needed
 */
export async function generateUniqueOnelink(baseHandle: string): Promise<string> {
  let onelink = baseHandle;
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const isAvailable = await isOnelinkAvailable(onelink);

    if (isAvailable) {
      return onelink;
    }

    // If not available, append random number
    const randomSuffix = Math.floor(Math.random() * 10000);
    onelink = `${baseHandle}${randomSuffix}`;
    attempts++;
  }

  // If we can't find an available onelink after many attempts, use timestamp
  return `${baseHandle}${Date.now()}`;
}

/**
 * Processes email to generate a unique onelink
 */
export async function processEmailToUniqueOnelink(email: string): Promise<string> {
  const baseHandle = extractHandleFromEmail(email);
  return await generateUniqueOnelink(baseHandle);
}

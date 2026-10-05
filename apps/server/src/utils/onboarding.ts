import { prisma } from "@repo/database";
import { uuidv7 } from "./uuid-v7";

/**
 * Called from the sign up hook. Email sign up and a Google sign up that kept
 * the claimed handle start with the URL confirmed; a handle generated from the
 * email starts on Choose your URL (015 I02).
 */
export async function createOnboardingRecord(userId: number, urlConfirmed: boolean) {
  try {
    await prisma.userOnboarding.upsert({
      where: { user_id: userId },
      create: { id: uuidv7(), user_id: userId, url_confirmed_at: urlConfirmed ? new Date() : null },
      update: {},
    });
  } catch (error) {
    // Sign up must succeed even if the record fails; status() creates it later
    console.error("Error creating onboarding record:", error);
  }
}

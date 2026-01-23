import { prisma } from "../services/DB";
import crypto from "crypto";

const CODE_LENGTH = 6;
const CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Sem caracteres confusos (0/O, 1/l/I)

/**
 * Gera um código de referral curto e único (ex: "ABC123")
 */
export async function generateUniqueReferralCode(): Promise<string> {
  const MAX_ATTEMPTS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      const randomIndex = crypto.randomInt(0, CHARS.length);
      code += CHARS[randomIndex];
    }

    // Verificar se já existe
    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!existing) {
      return code;
    }
  }

  // Fallback: usar timestamp + random
  return `${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`;
}

/**
 * Busca usuário por código de referral
 */
export async function findUserByReferralCode(code: string) {
  return await prisma.user.findUnique({
    where: { referralCode: code },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
    },
  });
}

/**
 * Valida se um código de referral existe
 */
export async function validateReferralCode(code: string): Promise<boolean> {
  const user = await findUserByReferralCode(code);
  return !!user;
}

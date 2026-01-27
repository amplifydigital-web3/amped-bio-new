import { router, publicProcedure, privateProcedure } from "./trpc";
import { z } from "zod";
import { prisma } from "../services/DB";
import { TRPCError } from "@trpc/server";
import { validateReferralCode, findUserByReferralCode } from "../utils/referral-code-generator";

export const referralRouter = router({
  // Validar código de referral
  validateReferralCode: publicProcedure
    .input(z.object({ code: z.string().min(3) }))
    .query(async ({ input }) => {
      const valid = await validateReferralCode(input.code);
      if (!valid) return { valid: false, referrer: null };

      const referrer = await findUserByReferralCode(input.code);
      return {
        valid: true,
        referrer: {
          id: referrer?.id || 0,
          name: referrer?.name || "",
          handle: referrer?.handle || ""
        }
      };
    }),

  // Processar referral após signup (chamado pelo cliente)
  processReferralAfterSignup: privateProcedure
    .input(z.object({ referralCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;

      // Buscar o referenciador
      const referrer = await prisma.user.findUnique({
        where: { referralCode: input.referralCode }
      });

      if (!referrer || referrer.id === userId) {
        return { success: false, reason: "invalid_code" };
      }

      // Verificar se já tem um indicador
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { referredBy: true }
      });

      if (existing?.referredBy) {
        return { success: false, reason: "already_referred" };
      }

      // Verificar se já existe um registro de Referral
      const existingReferral = await prisma.referral.findUnique({
        where: {
          referrerId_referredId: {
            referrerId: referrer.id,
            referredId: userId
          }
        }
      });

      if (existingReferral) {
        return { success: false, reason: "already_exists" };
      }

      // Criar registro de Referral e atualizar o usuário
      await prisma.$transaction([
        // Criar o registro de Referral
        prisma.referral.create({
          data: {
            referrerId: referrer.id,
            referredId: userId
          }
        }),
        // Atualizar o usuário com o referenciador
        prisma.user.update({
          where: { id: userId },
          data: { referredBy: referrer.id }
        })
      ]);

      return { success: true };
    }),

  // Buscar informações de referral do usuário atual
  myReferralInfo: privateProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user!.sub;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          referralCode: true,
          referredBy: true,
          referrals: {
            select: {
              id: true,
              name: true,
              email: true,
              handle: true,
              created_at: true
            }
          }
        }
      });

      return {
        referralCode: user?.referralCode,
        referredBy: user?.referredBy,
        totalReferrals: user?.referrals.length || 0,
        referrals: user?.referrals || []
      };
    }),

  // Listar indicações com paginação
  myReferrals: privateProcedure
    .input(z.object({
      page: z.number().optional().default(1),
      limit: z.number().optional().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const safePage = Math.max(input.page, 1);
      const safeLimit = Math.min(input.limit, 50);

      const [referrals, total] = await Promise.all([
        prisma.user.findMany({
          where: { referredBy: userId },
          select: {
            id: true,
            name: true,
            email: true,
            handle: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        }),
        prisma.user.count({ where: { referredBy: userId } })
      ]);

      return {
        referrals,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit)
      };
    }),

  // Estatísticas de referral
  referralStats: privateProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user!.sub;

      const [totalReferrals, recentReferrals] = await Promise.all([
        prisma.referral.count({ where: { referrerId: userId } }),
        prisma.referral.findMany({
          where: { referrerId: userId },
          include: {
            referred: {
              select: {
                id: true,
            name: true,
            created_at: true
              }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 5
        })
      ]);

      return {
        totalReferrals,
        recentReferrals: recentReferrals.map(r => ({
          id: r.referred.id,
          name: r.referred.name,
          createdAt: r.createdAt
        }))
      };
    }),
});

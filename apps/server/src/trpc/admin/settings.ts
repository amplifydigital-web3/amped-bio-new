import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { prisma } from "../../services/DB";
import { SettingValueType } from "@prisma/client";

export const settingsRouter = router({
  getFaucetStatus: adminProcedure.query(async () => {
    const faucetStatus = await prisma.siteSettings.findUnique({
      where: { setting_key: "faucet_enabled" },
    });
    return faucetStatus?.setting_value === "true";
  }),

  setFaucetStatus: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: "faucet_enabled" },
        update: {
          setting_value: input.enabled.toString(),
          value_type: "BOOLEAN",
        },
        create: {
          setting_key: "faucet_enabled",
          setting_value: input.enabled.toString(),
          value_type: "BOOLEAN",
        },
      });
    }),
});

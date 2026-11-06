import { prisma } from "@repo/database";
import { SITE_SETTINGS } from "@repo/constants";

/**
 * Pause Buy USDC (Build Board #5 USDC-6, spec 3.8). While on, no new Coinbase
 * quote, link or order is made and the panel shows the paused line. Sessions
 * already open keep reporting, and the webhook keeps recording.
 */

export async function onrampPausedSetting(): Promise<boolean> {
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: SITE_SETTINGS.USDC_ONRAMP_PAUSED },
  });
  return row?.setting_value === "true";
}

export async function setOnrampPaused(paused: boolean) {
  await prisma.siteSettings.upsert({
    where: { setting_key: SITE_SETTINGS.USDC_ONRAMP_PAUSED },
    create: {
      setting_key: SITE_SETTINGS.USDC_ONRAMP_PAUSED,
      setting_value: String(paused),
      value_type: "BOOLEAN",
    },
    update: { setting_value: String(paused), value_type: "BOOLEAN" },
  });
  console.info(`[onramp admin] Buy USDC ${paused ? "paused" : "resumed"}`);
  return { paused };
}

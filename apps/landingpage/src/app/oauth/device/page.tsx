import type { Metadata } from "next";
import { OAuthDeviceScreen, OAuthShell } from "@repo/ui";

export const metadata: Metadata = {
  title: "Connect a device | Amped.bio",
  description: "Approve a device that is requesting access to your Amped.bio account.",
  robots: { index: false, follow: false },
};

export default function OAuthDevicePage() {
  return (
    <OAuthShell
      title="Connect a device"
      subtitle="Enter the code shown on your device to approve access."
      footer="Only approve codes you requested yourself."
    >
      <OAuthDeviceScreen />
    </OAuthShell>
  );
}

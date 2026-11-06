import type { Metadata } from "next";
import { MiniApp } from "@/components/telegram/MiniApp";

export const metadata: Metadata = {
  title: "Amped.Bio",
  robots: { index: false, follow: false },
};

/**
 * The Telegram Mini App (Build Board #2, phase 3, spec r3 3.7, board tg7). BotFather's
 * Main Mini App URL points here. Telegram opens it with signed launch data, and the
 * server builds the page under the TON allow list; nothing renders outside Telegram.
 */
export default function TelegramMiniAppPage() {
  return <MiniApp />;
}

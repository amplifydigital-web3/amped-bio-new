"use client";

import { MessageCircle } from "lucide-react";
import type { ThemeConfig } from "@repo/constants";
import { TextBlock as TextBlockT } from "@repo/constants";
import { CreatorButton } from "./frame";

interface TelegramBlockProps {
  block: TextBlockT;
  theme: ThemeConfig;
}

// Screen Review 040 I13: the creator's colors only; the join link uses the
// shared button anatomy.
export function TelegramBlock({ block, theme }: TelegramBlockProps) {
  if (!/^https:\/\//.test(block.config.content || "")) return null;
  const text = { fontFamily: theme.fontFamily, color: theme.fontColor };
  return (
    <div className="w-full space-y-[13px] px-[21px] py-[13px]">
      <div className="flex items-center gap-2" style={text}>
        <MessageCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
        <h3 className="text-[16px] font-semibold leading-[20px]">Join our Telegram Channel</h3>
      </div>
      <CreatorButton theme={theme} label="Join Channel" href={block.config.content} />
      <p className="text-[13px] leading-[16px]" style={text}>
        Stay updated with our latest announcements and community discussions.
      </p>
    </div>
  );
}

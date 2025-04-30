import type { ThemeConfig } from "../../types/editor";
import { EmailCollectionBlock } from "./EmailCollectionBlock";
import { TelegramBlock } from "./TelegramBlock";
import { TeamBlock } from "./TeamBlock";
import { TextBlock as TextBlockT } from "@/api/api.types";

interface TextBlockProps {
  block: TextBlockT;
  theme: ThemeConfig;
}

export function TextBlock({ block, theme }: TextBlockProps) {
  // Check if this is a special text block type
  if (block.config.platform === "email-collect") {
    return <EmailCollectionBlock block={block} theme={theme} />;
  }
  if (block.config.platform === "telegram") {
    return <TelegramBlock block={block} theme={theme} />;
  }
  if (block.config.platform === "team") {
    return <TeamBlock block={block} theme={theme} />;
  }

  // Regular text block
  return (
    <div
      className="w-full p-4 rounded-lg bg-white/50 backdrop-blur-sm"
      style={{ fontFamily: theme.fontFamily }}
    >
      <p
        className="whitespace-pre-wrap"
        style={{
          color: theme.fontColor,
          fontSize: theme.fontSize,
        }}
      >
        {block.config.content}
      </p>
    </div>
  );
}

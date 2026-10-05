import type { ThemeConfig } from "@repo/constants";
import { TextBlock as TextBlockT, sanitizeRichHtml } from "@repo/constants";
import { isHTML } from "@/lib/htmlutils";
import { TelegramBlock } from "@/components/blocks/TelegramBlock";
import { TeamBlock } from "@/components/blocks/TeamBlock";
import { clampedFontSize } from "@/components/blocks/frame";

interface TextBlockProps {
  block: TextBlockT;
  theme: ThemeConfig;
}

// Screen Review 040 I03, I10: sanitized text straight on the creator's
// container, 16/26 in the creator's font and color, no white panel behind it.
export function TextBlock({ block, theme }: TextBlockProps) {
  // 040 D3: email collection confirms sign ups it never sends, so it does not
  // render to visitors until it is wired to a real list
  if (block.config.platform === "email-collect") return null;
  if (block.config.platform === "telegram") return <TelegramBlock block={block} theme={theme} />;
  if (block.config.platform === "team") return <TeamBlock block={block} theme={theme} />;

  const style = {
    fontFamily: theme.fontFamily,
    color: theme.fontColor,
    fontSize: clampedFontSize(theme),
    lineHeight: "26px",
  };

  return (
    <div className="w-full px-[21px] py-[13px]">
      {isHTML(block.config.content) ? (
        <div
          className="space-y-[13px] [&_a]:underline [&_a]:underline-offset-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          style={style}
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.config.content) }}
        />
      ) : (
        <p className="whitespace-pre-wrap" style={style}>
          {block.config.content}
        </p>
      )}
    </div>
  );
}

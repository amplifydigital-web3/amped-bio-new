import type { ThemeConfig } from "@repo/constants";
import { TextBlock as TextBlockT } from "@repo/constants";
import { isHTML } from "@/lib/htmlutils";

interface TextBlockProps {
  block: TextBlockT;
  theme: ThemeConfig;
}

export function TextBlock({ block, theme }: TextBlockProps) {
  const isHTML_ = isHTML(block.config.content);

  return (
    <div
      className="w-full p-4 rounded-lg bg-white/50 backdrop-blur-sm"
      style={{ fontFamily: theme.fontFamily }}
    >
      {isHTML_ ? (
        <div
          className="text-content"
          dangerouslySetInnerHTML={{ __html: block.config.content }}
          style={{
            color: theme.fontColor,
            fontSize: theme.fontSize,
          }}
        />
      ) : (
        <p
          className="whitespace-pre-wrap"
          style={{
            color: theme.fontColor,
            fontSize: theme.fontSize,
          }}
        >
          {block.config.content}
        </p>
      )}
    </div>
  );
}

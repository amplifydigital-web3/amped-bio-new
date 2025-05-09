import { ArrowUpRight } from "lucide-react";
import type { ThemeConfig } from "../../types/editor";
import { MediaBlock } from "@/api/api.types";

interface UniswapBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

export function UniswapBlock({ block, theme }: UniswapBlockProps) {
  if (!block.config.content) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#FF007A]/10 border-2 border-dashed border-[#FF007A]/20 flex flex-col items-center justify-center space-y-2">
        <ArrowUpRight className="w-8 h-8 text-[#FF007A]" />
        <p className="text-sm text-[#FF007A]" style={{ fontFamily: theme.fontFamily }}>
          Add a Uniswap swap widget URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <ArrowUpRight className="w-4 h-4 text-[#FF007A]" />
        <span
          className="text-sm font-medium text-[#FF007A]"
          style={{ fontFamily: theme.fontFamily }}
        >
          Uniswap Swap
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-white shadow-lg">
        <iframe
          src={block.config.content}
          width="100%"
          height="400"
          frameBorder="0"
          allowTransparency
          allow="encrypted-media"
          loading="lazy"
          className="w-full"
        />
      </div>
    </div>
  );
}

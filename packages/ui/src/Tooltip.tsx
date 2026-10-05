"use client";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "./utils";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

export function Tooltip({ content, children, side = "top", align = "center" }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            className={cn(
              "z-50 max-w-[288px] rounded-prism-8 bg-prism-ink px-3 py-2 font-prism text-prism-meta text-white animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none",
              "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1",
              "data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1"
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-prism-ink" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

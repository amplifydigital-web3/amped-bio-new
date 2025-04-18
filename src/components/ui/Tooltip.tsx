import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/utils/cn";

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
              "z-50 overflow-hidden rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white animate-in fade-in-0 zoom-in-95",
              "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1",
              "data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1"
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-gray-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

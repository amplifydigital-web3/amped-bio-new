"use client";
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../utils";

// Prism tabs (section 7): G1 navigate container 55 high, padding 5, gap 3,
// pill. Tabs 43 high, padding 0 21; the selected tab is the lens thumb.
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "prism-glass-nav inline-flex h-commit max-w-full items-center gap-[3px] overflow-x-auto rounded-full p-[5px]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "prism-focus inline-flex h-[43px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 font-prism text-prism-label font-medium text-prism-ink-2",
      "transition-[box-shadow,background-color,color] duration-prism-control ease-prism motion-reduce:transition-none",
      "hover:bg-white/50 data-[state=active]:prism-lens-thumb data-[state=active]:hover:bg-transparent",
      "disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("prism-focus mt-5 rounded-prism-13", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

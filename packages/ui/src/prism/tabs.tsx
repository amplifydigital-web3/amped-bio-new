"use client";
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../utils";
import { useIsomorphicLayoutEffect } from "./motion";

// Prism tabs (section 7): G1 navigate container 55 high, padding 5, gap 3,
// pill. Tabs 43 high, padding 0 21; the selected tab is the lens thumb.
const Tabs = TabsPrimitive.Root;

type LensBox = { x: number; width: number; animate: boolean };

/** Measures the selected tab so one lens can glide between tabs. */
function useGlidingLens(listRef: React.RefObject<HTMLDivElement | null>) {
  const [lens, setLens] = React.useState<LensBox | null>(null);
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let measured = false;
    const update = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!active || active.offsetWidth === 0) {
        setLens(null);
        return;
      }
      const next = { x: active.offsetLeft, width: active.offsetWidth };
      // The first measurement places the lens; later ones glide
      setLens(current =>
        current && current.x === next.x && current.width === next.width
          ? current
          : { ...next, animate: measured }
      );
      measured = true;
    };
    update();
    const mutations = new MutationObserver(update);
    mutations.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    sizes?.observe(list);
    list.querySelectorAll('[role="tab"]').forEach(tab => sizes?.observe(tab));
    return () => {
      mutations.disconnect();
      sizes?.disconnect();
    };
  }, [listRef]);
  return lens;
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const lens = useGlidingLens(listRef);
  return (
    <TabsPrimitive.List
      ref={node => {
        listRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      data-glide={lens ? "on" : "off"}
      className={cn(
        "prism-glass-nav group/tabs relative inline-flex h-commit max-w-full items-center gap-[3px] overflow-x-auto rounded-full p-[5px]",
        className
      )}
      {...props}
    >
      {lens && (
        // The selected tab's lens thumb glides to the next tab (panel time, section 14)
        <span
          aria-hidden
          className={cn(
            "prism-lens-thumb pointer-events-none absolute left-0 top-[5px] h-[43px] rounded-full",
            lens.animate &&
              "transition-[transform,width] duration-prism-panel ease-prism motion-reduce:transition-none"
          )}
          style={{ width: lens.width, transform: `translateX(${lens.x}px)` }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
});
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
      // The lens is one gliding element in the list; until it is measured, the tab paints its own
      "relative hover:bg-white/50 data-[state=active]:font-bold data-[state=active]:text-prism-nav-pressed data-[state=active]:hover:bg-transparent group-data-[glide=off]/tabs:data-[state=active]:prism-lens-thumb",
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
    // The new tab's content fades in (control time, #26)
    className={cn("prism-focus prism-swap mt-5 rounded-prism-13", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

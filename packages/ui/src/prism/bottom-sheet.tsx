"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../utils";
import { MOTION, PRISM_EASE } from "./motion";

// Prism bottom sheet (Screen Review 003 D1): raised G1 glass, full width,
// r34 top corners, 44 wide grab handle, scrim behind. Used for the mobile More
// sheet and other mobile choosers. Focus is trapped; Escape, the scrim and a
// drag down close it, and focus returns to the trigger.

/**
 * Drag down to dismiss (Build Board #26, section 3.4): past 30% of the sheet
 * height or faster than 0.6 px per ms closes it; otherwise it settles back in
 * panel time. Pointer events only, no library. Buttons in the zone still click.
 */
function useDragToDismiss(sheetRef: React.RefObject<HTMLDivElement | null>, dismiss: () => void) {
  const start = React.useRef<{ y: number; t: number; id: number } | null>(null);
  const offset = React.useRef(0);

  const end = (event: React.PointerEvent) => {
    const sheet = sheetRef.current;
    const began = start.current;
    if (!sheet || !began || began.id !== event.pointerId) return;
    start.current = null;
    const elapsed = Math.max(1, performance.now() - began.t);
    const distance = offset.current;
    offset.current = 0;
    if (distance > sheet.offsetHeight * 0.3 || distance / elapsed > 0.6) {
      // The close animation starts from where the finger left the sheet
      dismiss();
      return;
    }
    sheet.style.transition = `transform ${MOTION.panel}ms ${PRISM_EASE}`;
    sheet.style.transform = "";
    window.setTimeout(() => {
      if (!start.current) sheet.style.transition = "";
    }, MOTION.panel);
  };

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input")) return;
      start.current = { y: event.clientY, t: performance.now(), id: event.pointerId };
      offset.current = 0;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      if (sheetRef.current) sheetRef.current.style.transition = "none";
    },
    onPointerMove: (event: React.PointerEvent) => {
      const sheet = sheetRef.current;
      if (!sheet || !start.current || start.current.id !== event.pointerId) return;
      offset.current = Math.max(0, event.clientY - start.current.y);
      sheet.style.transform = `translateY(${offset.current}px)`;
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}
const BottomSheet = DialogPrimitive.Root;
const BottomSheetTrigger = DialogPrimitive.Trigger;
const BottomSheetClose = DialogPrimitive.Close;

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    title: string;
    // Hide the visible title (it stays available to screen readers)
    hideTitle?: boolean;
  }
>(({ className, children, title, hideTitle = false, ...props }, ref) => {
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const drag = useDragToDismiss(sheetRef, () => closeRef.current?.click());
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="prism-scrim fixed inset-0 z-50 duration-prism-panel ease-prism data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
      <DialogPrimitive.Content
        ref={node => {
          sheetRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        aria-describedby={undefined}
        className={cn(
          "prism-raised fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[610px] flex-col rounded-t-prism-34 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-8 font-prism",
          "duration-prism-panel ease-prism data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom motion-reduce:animate-none",
          className
        )}
        {...props}
      >
        {/* Drag zone: the grab handle and the title row. Drag down to dismiss (section 3.4). */}
        <div {...drag} className="-mx-5 -mt-8 touch-none select-none px-5 pt-8">
          <span
            aria-hidden
            className="absolute left-1/2 top-2 h-1.5 w-11 -translate-x-1/2 cursor-grab rounded-full bg-prism-line-strong active:cursor-grabbing"
          />
          <div className="mb-3 flex min-h-touch items-center justify-between gap-3">
            <DialogPrimitive.Title
              className={cn("text-prism-panel-title text-prism-ink", hideTitle && "sr-only")}
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close ref={closeRef} className="prism-icon-btn prism-focus ml-auto">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
        </div>
        <div className="-mx-5 flex-1 overflow-y-auto px-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
BottomSheetContent.displayName = "BottomSheetContent";

export { BottomSheet, BottomSheetTrigger, BottomSheetClose, BottomSheetContent };

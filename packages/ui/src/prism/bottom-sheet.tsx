"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../utils";

// Prism bottom sheet (Screen Review 003 D1): raised G1 glass, full width,
// r34 top corners, 44 wide grab handle, scrim behind. Used for the mobile More
// sheet and other mobile choosers. Focus is trapped; Escape closes.
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
>(({ className, children, title, hideTitle = false, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="prism-scrim fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      className={cn(
        "prism-raised fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[610px] flex-col rounded-t-prism-34 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-8 font-prism",
        "duration-prism-panel ease-prism data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom motion-reduce:animate-none",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="absolute left-1/2 top-2 h-1.5 w-11 -translate-x-1/2 rounded-full bg-prism-line-strong"
      />
      <div className="mb-3 flex min-h-touch items-center justify-between gap-3">
        <DialogPrimitive.Title
          className={cn("text-prism-panel-title text-prism-ink", hideTitle && "sr-only")}
        >
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Close className="prism-icon-btn prism-focus ml-auto">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </div>
      <div className="-mx-5 flex-1 overflow-y-auto px-5">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
BottomSheetContent.displayName = "BottomSheetContent";

export { BottomSheet, BottomSheetTrigger, BottomSheetClose, BottomSheetContent };

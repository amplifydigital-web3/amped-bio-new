import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

// Prism 2.2 section 8. Every size meets the 44 target; lg is the 55 primary.
// Press: 1 down in micro time (section 14), none under reduced motion.
const buttonVariants = cva(
  "prism-focus prism-btn-disabled inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-prism-13 font-prism font-semibold tabular-nums transition-[background-color,box-shadow,color,transform] duration-prism-hover ease-prism active:translate-y-px active:duration-prism-micro disabled:active:translate-y-0 motion-reduce:active:translate-y-0 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Next step (navigate). The one primary action of a region.
        default: "prism-btn-primary font-bold",
        // Money commit only (stake, send, confirm in wallet).
        commit: "prism-btn-commit font-bold",
        // Kept for existing callers; same as default. Green is not a Prism action color.
        confirm: "prism-btn-primary font-bold",
        secondary: "prism-btn-secondary",
        outline: "prism-btn-secondary",
        ghost: "prism-btn-ghost",
        link: "h-auto min-h-touch px-1 text-prism-nav underline-offset-4 hover:underline",
        destructive: "prism-btn-destructive font-bold",
      },
      size: {
        default: "h-touch px-5 text-prism-label",
        sm: "h-touch px-3 text-sm",
        lg: "h-commit px-8 text-prism-label",
        icon: "h-touch w-touch rounded-full p-0",
      },
    },
    // A link is text, not a pill: keep its own height and padding over the size ones
    compoundVariants: [{ variant: "link", class: "h-auto px-1" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

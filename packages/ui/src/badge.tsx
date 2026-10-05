import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  // Prism badge: 26 high, r8, 13 600 label (section 9)
  "inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-prism-8 px-2 font-prism text-prism-meta font-semibold tabular-nums",
  {
    variants: {
      variant: {
        // Selected or active state (indigo)
        default: "bg-prism-nav text-white",
        // Category or neutral label
        secondary: "bg-white/90 text-prism-ink-2 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]",
        destructive: "bg-prism-danger text-white",
        outline: "text-prism-ink-2 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]",
        success: "bg-white/90 text-prism-success shadow-[inset_0_0_0_1px_rgba(23,105,63,0.28)]",
        warning:
          "bg-prism-warning-bg text-prism-warning-ink shadow-[inset_0_0_0_1px_rgba(122,79,0,0.28)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

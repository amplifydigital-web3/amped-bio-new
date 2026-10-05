"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Prism toast (Screen Review 084): raised glass, r13, 55 minimum, 16/24 ink.
      position="bottom-left"
      offset={34}
      toastOptions={{
        // Unstyled so the Prism classes are not overridden by Sonner's own theme
        unstyled: true,
        classNames: {
          toast:
            "group toast prism-raised flex w-full items-center gap-3 rounded-prism-13 min-h-commit px-5 py-3 font-prism text-prism-body text-prism-ink",
          title: "text-prism-label font-semibold",
          description: "text-prism-body text-prism-ink-2",
          actionButton:
            "prism-btn-ghost prism-focus ml-auto h-touch shrink-0 rounded-prism-13 px-3 font-semibold",
          cancelButton: "prism-btn-secondary prism-focus h-touch shrink-0 rounded-prism-13 px-3",
          success: "[&_[data-icon]]:text-prism-success",
          error: "[&_[data-icon]]:text-prism-danger",
          info: "[&_[data-icon]]:text-prism-nav",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

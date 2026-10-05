"use client";

import * as React from "react";
import { toast as hotToast } from "react-hot-toast";
import { ToastCard } from "@repo/ui";

// App toast API, kept for existing callers (toast.add / toast.close).
// Since the Prism rollout (Screen Review 084, D21) it runs on the same
// react-hot-toast queue as every other toast in the client, so there is one
// stack in one place, rendered as the Prism ToastCard by the Toaster in App.tsx.

export type ToastType = "default" | "success" | "error" | "warning" | "info" | "loading";

export interface ToastActionProps {
  children?: React.ReactNode;
  onClick?: () => void;
}

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  type?: ToastType;
  duration?: number;
  actionProps?: ToastActionProps;
}

const DEFAULT_DURATION = 5000;
// Errors stay longer so they can be read, but still leave on their own so routine
// validation errors do not pile up. Pass duration: Infinity when the user must act.
export const ERROR_TOAST_DURATION = 10000;

function addToast(options: ToastOptions): string {
  // Prism: success and info leave after 5 seconds; errors after 10 seconds
  const duration =
    options.duration ?? (options.type === "error" ? ERROR_TOAST_DURATION : DEFAULT_DURATION);
  const action = options.actionProps;

  return hotToast.custom(
    t => (
      <ToastCard
        type={options.type}
        title={options.title}
        description={options.description}
        action={action?.onClick ? { label: action.children, onClick: action.onClick } : undefined}
        onDismiss={() => hotToast.dismiss(t.id)}
        className={
          t.visible
            ? "animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
            : "animate-out fade-out duration-150"
        }
      />
    ),
    { duration }
  );
}

function closeToast(id: string) {
  hotToast.dismiss(id);
}

export const toast = {
  add: addToast,
  close: closeToast,
};

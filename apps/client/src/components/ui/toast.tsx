"use client";

import * as React from "react";
import { CheckCircle2, Info, Loader2, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface ToastItem extends ToastOptions {
  id: string;
}

const DEFAULT_DURATION = 5000;

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

function genId() {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return counter.toString();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

function emit() {
  listeners.forEach(listener => listener());
}

function addToast(options: ToastOptions): string {
  const id = genId();
  toasts = [{ ...options, id }, ...toasts];
  emit();

  const duration = options.duration ?? DEFAULT_DURATION;
  if (duration !== Infinity) {
    timeouts.set(
      id,
      setTimeout(() => {
        timeouts.delete(id);
        closeToast(id);
      }, duration)
    );
  }

  return id;
}

function closeToast(id: string) {
  const timeout = timeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    timeouts.delete(id);
  }
  toasts = toasts.filter(toast => toast.id !== id);
  emit();
}

export const toast = {
  add: addToast,
  close: closeToast,
};

const TYPE_ICONS: Record<ToastType, React.ReactNode> = {
  default: null,
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />,
  error: <XCircle className="h-5 w-5 text-destructive shrink-0" />,
  warning: <TriangleAlert className="h-5 w-5 text-amber-500 shrink-0" />,
  info: <Info className="h-5 w-5 text-blue-500 shrink-0" />,
  loading: <Loader2 className="h-5 w-5 text-muted-foreground shrink-0 animate-spin" />,
};

function useToasts() {
  return React.useSyncExternalStore(subscribe, getSnapshot);
}

export function Toaster() {
  const items = useToasts();

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map(item => (
        <div
          key={item.id}
          className={cn(
            "pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-md border bg-background p-4 text-foreground shadow-lg",
            "animate-in slide-in-from-top-2 fade-in duration-200"
          )}
          role={item.type === "error" ? "alert" : "status"}
        >
          {TYPE_ICONS[item.type ?? "default"]}
          <div className="grid flex-1 gap-1">
            {item.title && <div className="text-sm font-semibold">{item.title}</div>}
            {item.description && <div className="text-sm opacity-90">{item.description}</div>}
          </div>
          {item.actionProps && (
            <button
              onClick={item.actionProps.onClick}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              {item.actionProps.children}
            </button>
          )}
          <button
            onClick={() => toast.close(item.id)}
            className="shrink-0 rounded-md p-1 text-foreground/50 transition-opacity hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

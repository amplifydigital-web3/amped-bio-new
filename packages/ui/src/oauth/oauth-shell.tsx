"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "../utils";

interface OAuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Minimal, hosted authorization page frame: a single centered card with no
 * application navigation, matching the way identity providers present sign-in
 * and consent screens.
 */
export function OAuthShell({ title, subtitle, children, footer, className }: OAuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className={cn("w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm", className)}>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-gray-600">{subtitle}</p> : null}
          </div>
        </div>

        {children}
      </div>

      {footer ? <div className="mt-6 text-center text-xs text-gray-500">{footer}</div> : null}
    </div>
  );
}

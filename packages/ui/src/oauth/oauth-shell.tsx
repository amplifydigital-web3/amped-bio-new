"use client";

import type { ReactNode } from "react";
import { AuthCard } from "../prism/auth";

interface OAuthShellProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  // The host's public header (Sign in hidden on auth routes)
  header?: ReactNode;
  className?: string;
}

/**
 * Hosted authorization page frame (Screen Review 009 I19): the shared Prism
 * auth card on the room, under the host's public header.
 */
export function OAuthShell({
  title,
  subtitle,
  children,
  footer,
  header,
  className,
}: OAuthShellProps) {
  return (
    <div className="prism-room prism-font flex min-h-dvh flex-col text-prism-ink">
      {header}
      <main className="flex-1 px-[13px] pb-[55px] pt-[21px] sm:pt-[68px]">
        <AuthCard
          title={title}
          subtitle={subtitle}
          className={className}
          footer={
            footer ? (
              <div className="font-prism text-prism-meta text-prism-ink-2">{footer}</div>
            ) : undefined
          }
        >
          {children}
        </AuthCard>
      </main>
    </div>
  );
}

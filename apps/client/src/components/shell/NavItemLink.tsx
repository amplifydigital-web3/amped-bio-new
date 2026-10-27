import type { MouseEvent, ReactNode } from "react";
import { cn } from "@repo/ui";
import type { EditorPanelType } from "@/types/editor";
import { useShellNavigation } from "./ShellNavigation";

/**
 * A destination link. It is a real link (open in new tab works), and a plain
 * click goes through the shell so a pending save is flushed first (D11).
 */
export function NavItemLink({
  panel,
  tab,
  current,
  className,
  children,
  onNavigate,
}: {
  panel: EditorPanelType;
  tab?: string;
  current: boolean;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  const { go } = useShellNavigation();
  const href = `/${panel}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    onNavigate?.();
    go(panel, { tab });
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-current={current ? "page" : undefined}
      className={cn("prism-focus", className)}
    >
      {children}
    </a>
  );
}

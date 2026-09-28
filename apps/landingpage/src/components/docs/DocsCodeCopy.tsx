"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Adds a copy button to every highlighted code block inside the documentation
 * article. The documentation itself stays server rendered HTML; this only
 * decorates it after hydration to avoid shipping the highlighter to the client.
 */
export function DocsCodeCopy({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cleanups: Array<() => void> = [];

    container.querySelectorAll("pre").forEach(pre => {
      if (pre.dataset.copyEnhanced === "true") return;
      pre.dataset.copyEnhanced = "true";
      pre.classList.add("relative", "group", "bg-gray-900", "p-4", "text-sm", "text-gray-100");

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Copy";
      button.className =
        "absolute right-3 top-3 rounded border border-gray-700 bg-gray-800/80 px-2 py-1 text-xs text-gray-200 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100";
      button.setAttribute("aria-label", "Copy code");

      const handleClick = async () => {
        const text = pre.innerText ?? "";
        if (!text) return;

        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = "Copy";
          }, 2000);
        } catch {
          button.textContent = "Copy failed";
        }
      };

      button.addEventListener("click", handleClick);
      pre.appendChild(button);

      cleanups.push(() => {
        button.removeEventListener("click", handleClick);
        button.remove();
      });
    });

    return () => cleanups.forEach(cleanup => cleanup());
  }, [children]);

  return <div ref={containerRef}>{children}</div>;
}

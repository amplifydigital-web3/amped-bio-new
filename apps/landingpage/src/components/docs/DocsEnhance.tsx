"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const COPY_ICON =
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
const CHECK_ICON = '<path d="M20 6 9 17l-5-5"/>';

/**
 * 090 I10, I15: wires the Copy buttons on code slabs and the heading anchors.
 * The buttons are already in the server rendered HTML; this adds behavior.
 */
export function DocsEnhance({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const setButton = (button: HTMLElement, label: string, success: boolean) => {
      const span = button.querySelector("[data-copy-label]");
      const svg = button.querySelector("svg");
      if (span) span.textContent = label;
      if (svg) svg.innerHTML = success ? CHECK_ICON : COPY_ICON;
    };

    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const codeButton = target.closest<HTMLElement>("[data-copy-code]");
      if (codeButton) {
        const code = codeButton.closest("figure")?.querySelector("pre > code");
        const value = code?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(value);
          setButton(codeButton, "Copied", true);
          setAnnouncement("Code copied");
          setTimeout(() => setButton(codeButton, "Copy", false), 2000);
        } catch {
          setButton(codeButton, "Copy failed", false);
          if (code) {
            const range = document.createRange();
            range.selectNodeContents(code);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
          setTimeout(() => setButton(codeButton, "Copy", false), 5000);
        }
        return;
      }
      const anchor = target.closest<HTMLElement>("[data-copy-anchor]");
      if (anchor) {
        const id = anchor.dataset.copyAnchor;
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        try {
          await navigator.clipboard.writeText(url);
          history.replaceState(null, "", `#${id}`);
          setToast("Link copied");
        } catch {
          setToast("The link did not copy");
        }
      }
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return (
    <div ref={ref}>
      {children}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {toast && (
        <div
          role="status"
          className="prism-raised fixed bottom-[21px] left-1/2 z-50 -translate-x-1/2 rounded-prism-13 px-[21px] py-[13px] font-prism text-prism-label font-semibold text-prism-ink"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

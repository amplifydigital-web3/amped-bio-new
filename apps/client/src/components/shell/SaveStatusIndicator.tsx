import { useEffect, useState } from "react";
import { AlertCircle, Check, WifiOff } from "lucide-react";
import { Button } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";

// Screen Review 002 I02, D11. Autosave status, 13/16 500 at the top bar's
// right: Saved, Saving (after 400ms), Could not save with Retry, Offline.
// Autosave success never raises a toast.
export function SaveStatusIndicator({ compact = false }: { compact?: boolean }) {
  const { saveStatus, flushSave } = useEditor();
  const [showSaving, setShowSaving] = useState(false);

  useEffect(() => {
    if (saveStatus !== "saving") {
      setShowSaving(false);
      return;
    }
    const timer = setTimeout(() => setShowSaving(true), 400);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  let content: React.ReactNode = null;
  if (saveStatus === "saved" || (saveStatus === "saving" && !showSaving)) {
    content = (
      <>
        <Check aria-hidden className="h-[21px] w-[21px] text-prism-success" />
        <span>Saved</span>
      </>
    );
  } else if (saveStatus === "saving") {
    content = (
      <>
        <span
          aria-hidden
          className="h-[18px] w-[18px] animate-spin rounded-full border-[1.5px] border-prism-line-strong border-t-prism-nav motion-reduce:animate-none"
        />
        <span>Saving</span>
      </>
    );
  } else if (saveStatus === "error") {
    content = (
      <>
        <AlertCircle aria-hidden className="h-[21px] w-[21px] text-prism-danger" />
        <span>Could not save</span>
        <Button variant="ghost" size="sm" onClick={() => void flushSave()}>
          Retry
        </Button>
      </>
    );
  } else if (saveStatus === "offline") {
    content = (
      <>
        <WifiOff aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
        <span>{compact ? "Offline" : "Offline. Changes save when you reconnect."}</span>
      </>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-prism-meta font-medium text-prism-ink-2"
    >
      {content}
    </div>
  );
}

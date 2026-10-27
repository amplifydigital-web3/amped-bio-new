import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useThemeActions } from "./useThemeActions";

// Screen Review 024 I06, 025 I04, 026 I05, 030 I03. Solid compliance notice
// for a failing contrast pair, with the measured ratio and one fix.
export function ContrastNotice({
  heading,
  body,
  actionLabel = "Fix contrast",
  onAction,
  disabled = false,
}: {
  heading: string;
  body: string;
  actionLabel?: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div role="status" className="prism-notice flex items-start gap-3 font-prism">
      <AlertTriangle
        aria-hidden
        className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
      />
      <div className="min-w-0 flex-1 text-[16px] leading-6 text-prism-ink">
        <p className="font-bold text-prism-warning-ink">{heading}</p>
        <p className="tabular-nums">{body}</p>
        {!disabled && (
          <Button variant="ghost" className="-ml-3 mt-1" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

// Screen Review 027 I09. One notice at the top of Style and Motion while the
// theme is a locked marketplace theme, with one step to make it editable.
export function LockedThemeNotice() {
  const { makeEditableCopy, pending } = useThemeActions();

  const handle = async () => {
    try {
      await makeEditableCopy();
    } catch {
      toast.add({
        type: "error",
        title: "Could not make an editable copy",
        actionProps: { children: "Retry", onClick: () => void handle() },
      });
    }
  };

  return (
    <div
      role="status"
      className="prism-glass-clear !rounded-prism-13 mb-[21px] flex items-start gap-3 py-[13px] pl-[13px] pr-[21px] font-prism"
    >
      <Info aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" />
      <div className="min-w-0 flex-1 text-[16px] leading-6 text-prism-ink">
        <p>
          This theme is locked, so its style can&apos;t be changed. Make an editable copy to
          customize it.
        </p>
        <Button
          variant="ghost"
          className="-ml-3 mt-1"
          onClick={() => void handle()}
          disabled={pending}
          aria-busy={pending}
        >
          Make an editable copy
        </Button>
      </div>
    </div>
  );
}

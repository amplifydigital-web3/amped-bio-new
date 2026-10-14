import { useId } from "react";
import { Search } from "lucide-react";
import {
  Button,
  ChipGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
  type ChipGroupOption,
} from "@repo/ui";
import { toast } from "sonner";

// Small admin pieces shared by rows 087 to 094.

/** Section eyebrow with the 13 x 3 marker: PLATFORM, OPERATIONS, CONTENT. */
export function Eyebrow({
  children,
  id,
  className,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  as?: "h2" | "h3" | "p";
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "flex items-center gap-2 font-prism text-prism-eyebrow uppercase text-prism-ink-2",
        className
      )}
    >
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </Tag>
  );
}

/**
 * G2 search well 44 with a 21 search icon. The label sits above (087 I14),
 * or is visually hidden when the icon and well already mark it (094 I01).
 */
export function SearchWell({
  label,
  value,
  onChange,
  placeholder,
  onSubmit,
  hideLabel = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <label
        htmlFor={id}
        className={cn(
          "block font-prism text-prism-label font-semibold text-prism-ink",
          hideLabel && "sr-only"
        )}
      >
        {label}
      </label>
      <div className="prism-well flex h-touch items-center gap-2 px-3">
        <Search
          aria-hidden
          className="h-[21px] w-[21px] shrink-0 text-prism-ink-2"
          strokeWidth={1.5}
        />
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && onSubmit) {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent font-prism text-prism-label text-prism-ink placeholder:text-prism-ink-3 focus:outline-none"
        />
      </div>
    </div>
  );
}

/** A labeled single choice chip row: ROLE All Users Admins. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: ChipGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        aria-hidden
        className="shrink-0 font-prism text-prism-eyebrow uppercase text-prism-ink-2"
      >
        {label}
      </span>
      <ChipGroup
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        className="flex-nowrap overflow-x-auto py-1 md:flex-wrap md:overflow-visible"
      />
    </div>
  );
}

/**
 * Confirm on the shared Dialog (087 I08, I16; 088 I05, I12; 089 overflow
 * actions). No typed word. Destructive actions use the destructive button.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive = false,
  busy = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const UNDO_MS = 8000;

/** Success toast with Undo for 8 seconds (row 084). */
export function undoToast(message: string, onUndo: () => void) {
  toast.success(message, {
    duration: UNDO_MS,
    action: { label: "Undo", onClick: onUndo },
  });
}

/** Error toast with Retry; stays until the person acts (row 084 I11). */
export function retryToast(message: string, onRetry: () => void) {
  toast.error(message, {
    duration: Infinity,
    action: { label: "Retry", onClick: onRetry },
  });
}

/** Busy indicator for a row or button while a call runs. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-prism-line-strong border-t-prism-nav motion-reduce:animate-none",
        className
      )}
    />
  );
}

/** Field error line 13/16 danger, linked by id (094 I06). */
export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="font-prism text-prism-meta text-prism-danger">
      {children}
    </p>
  );
}

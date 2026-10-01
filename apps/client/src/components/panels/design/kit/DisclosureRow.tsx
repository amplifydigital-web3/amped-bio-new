import { createContext, useCallback, useContext, useId, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Lock } from "lucide-react";
import { Skeleton, cn } from "@repo/ui";

// Screen Review 027. The G0 flat disclosure row used by Design Style and
// Motion: 55 high, label left, the current value right, a 21 chevron. One row
// is open at a time; the last open row is remembered per tab per viewer.

interface GroupValue {
  open: string | null;
  setOpen: (id: string | null) => void;
  readOnly: boolean;
  /** Open content keeps 21 side padding on every width (rows inside a card) */
  inset: boolean;
}

const GroupContext = createContext<GroupValue | null>(null);

function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage can be blocked; the default row opens next time
  }
}

export function DisclosureGroup({
  storageKey,
  defaultOpen,
  initialOpen,
  readOnly = false,
  inset = false,
  children,
}: {
  storageKey: string;
  defaultOpen: string | null;
  /** A deep link to one row (for example ?open=url) wins over the stored row */
  initialOpen?: string | null;
  /** Locked theme: rows open and close, their controls do not respond (027 I09) */
  readOnly?: boolean;
  inset?: boolean;
  children: ReactNode;
}) {
  const [open, setOpenState] = useState<string | null>(
    () => initialOpen ?? readStored(storageKey) ?? defaultOpen
  );
  const setOpen = useCallback(
    (id: string | null) => {
      setOpenState(id);
      writeStored(storageKey, id);
    },
    [storageKey]
  );
  return (
    <GroupContext.Provider value={{ open, setOpen, readOnly, inset }}>
      <div className="font-prism">{children}</div>
    </GroupContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDisclosureGroup() {
  const context = useContext(GroupContext);
  if (!context) throw new Error("useDisclosureGroup must be used inside DisclosureGroup");
  return context;
}

export function DisclosureRow({
  id,
  label,
  value,
  swatch,
  warning = false,
  children,
}: {
  id: string;
  label: string;
  /** Current value, 13/16 ink-2, readable with the row closed (I06) */
  value?: ReactNode;
  /** 34 x 21 r8 swatch before the value */
  swatch?: ReactNode;
  /** A contrast guard fails for this row */
  warning?: boolean;
  children: ReactNode;
}) {
  const { open, setOpen, readOnly, inset } = useDisclosureGroup();
  const isOpen = open === id;
  const buttonId = useId();
  const regionId = useId();

  return (
    <div className="border-b border-prism-line">
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={regionId}
          onClick={() => setOpen(isOpen ? null : id)}
          className="prism-focus flex h-commit w-full items-center gap-3 rounded-prism-13 px-[21px] text-left transition-[background-image] duration-prism-hover ease-prism hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.36)_0%,rgba(255,255,255,0)_40%)] active:duration-prism-micro"
        >
          <span className="flex-1 text-prism-label font-semibold text-prism-ink">{label}</span>
          <span className="flex min-w-0 items-center gap-2 text-prism-meta text-prism-ink-2">
            {warning && (
              <AlertTriangle
                aria-hidden
                className="h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
              />
            )}
            {readOnly && <Lock aria-hidden className="h-4 w-4 shrink-0" />}
            {swatch}
            <span className="truncate">{value}</span>
            {warning && <span className="sr-only">, contrast warning</span>}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-[21px] w-[21px] shrink-0 text-prism-ink-2 transition-transform duration-prism-control ease-prism motion-reduce:transition-none",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </h3>
      {/* Mounted only while open, so closed rows load no thumbnails (I08) */}
      {isOpen && (
        <div
          role="region"
          id={regionId}
          aria-labelledby={buttonId}
          className={cn(
            "animate-in fade-in slide-in-from-top-1 pb-[34px] pt-[13px] duration-prism-control motion-reduce:animate-none",
            inset ? "px-[21px] pb-[21px]" : "px-0 sm:px-[21px]"
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Row skeleton while the theme loads (I10): shown after 400ms. */
export function DisclosureRowSkeleton() {
  return (
    <div className="flex h-commit items-center justify-between border-b border-prism-line px-[21px]">
      <Skeleton delayMs={400} className="h-[13px] w-[144px] rounded-prism-8" />
      <Skeleton delayMs={400} className="h-[13px] w-[89px] rounded-prism-8" />
    </div>
  );
}

/** A 34 x 21 r8 swatch for a row value. */
export function ValueSwatch({
  style,
  className,
}: {
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-[21px] w-[34px] shrink-0 overflow-hidden rounded-prism-8 bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]",
        className
      )}
      style={style}
    />
  );
}

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonAlert,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../utils";
import { Button } from "../button";

// Screen Review 085. Empty state on G0: 34 icon in a 55 disc, title 20/23 700,
// one line 16/26 body, one next step. Say whether the list never had data or
// the search has no results; never show "No results" before a search.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  // One next step: pass a Button (primary if it is the region's main job)
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3 px-5 py-8 text-center font-prism", className)}
    >
      <span className="prism-disc" aria-hidden>
        <Icon className="h-[34px] w-[34px] text-prism-ink-3" strokeWidth={1.5} />
      </span>
      <h3 className="text-prism-panel-title text-prism-ink">{title}</h3>
      {description && (
        <p className="max-w-[42ch] text-prism-body text-prism-ink-2">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Screen Review 083. Local error: G1 clear card r21, 21 danger icon, a title
// that names what failed, one line cause, Retry as a 44 secondary lens.
export function ErrorCard({
  title,
  cause,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  // Name what failed, for example "Pools did not load"
  title: string;
  // One line, plain words. Never raw server text.
  cause?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("prism-glass-clear flex items-start gap-3 p-5 font-prism", className)}
    >
      <XCircle className="mt-px h-[21px] w-[21px] shrink-0 text-prism-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-prism-label font-bold text-prism-ink">{title}</p>
        {cause && <p className="mt-1 text-prism-body text-prism-ink-2">{cause}</p>}
        {onRetry && (
          <Button variant="secondary" className="mt-3" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

// Screen Review 005 D1. Info and success on G1 clear r13 with a 21 utility
// icon; warning and error on the solid compliance notice (never glass).
const NOTICE: Record<
  "info" | "success" | "warning" | "error",
  { icon: LucideIcon; box: string; iconClass: string; titleClass: string }
> = {
  info: {
    icon: Info,
    box: "prism-glass-clear !rounded-prism-13 px-3 py-3",
    iconClass: "text-prism-nav",
    titleClass: "text-prism-ink",
  },
  success: {
    icon: CheckCircle2,
    box: "prism-glass-clear !rounded-prism-13 px-3 py-3",
    iconClass: "text-prism-success",
    titleClass: "text-prism-ink",
  },
  warning: {
    icon: AlertTriangle,
    box: "prism-notice",
    iconClass: "text-prism-warning-ink",
    titleClass: "text-prism-warning-ink",
  },
  error: {
    icon: OctagonAlert,
    box: "prism-notice",
    iconClass: "text-prism-danger",
    titleClass: "text-prism-danger",
  },
};

export function Notice({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: keyof typeof NOTICE;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, box, iconClass, titleClass } = NOTICE[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "note"}
      className={cn("flex items-start gap-3 font-prism", box, className)}
    >
      <Icon className={cn("mt-0.5 h-[21px] w-[21px] shrink-0", iconClass)} aria-hidden />
      <div className="min-w-0 flex-1 text-prism-body text-prism-ink">
        {title && <p className={cn("font-bold", titleClass)}>{title}</p>}
        {children}
      </div>
    </div>
  );
}

// The testnet line, verbatim, wherever tREVO appears in a flow or notice.
export const TESTNET_NOTICE =
  "Testnet only. tREVO has no cash value. Pool rewards are set by the creator, vary, and are not guaranteed.";

// Screen Review 084. One toast card: raised glass r13, 55 minimum, 21 icon,
// 16/24 ink, at most one ghost action. Used by every toaster in the apps.
export type PrismToastType = "default" | "success" | "error" | "warning" | "info" | "loading";

export function ToastCard({
  type = "default",
  title,
  description,
  action,
  onDismiss,
  className,
}: {
  type?: PrismToastType;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: { label: React.ReactNode; onClick: () => void };
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon =
    type === "success"
      ? CheckCircle2
      : type === "error"
        ? XCircle
        : type === "warning"
          ? AlertTriangle
          : type === "info"
            ? Info
            : null;
  const iconColor =
    type === "success"
      ? "text-prism-success"
      : type === "error"
        ? "text-prism-danger"
        : type === "warning"
          ? "text-prism-warning-ink"
          : "text-prism-nav";

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={cn(
        "prism-raised pointer-events-auto flex w-full min-h-commit max-w-[420px] items-center gap-3 rounded-prism-13 px-5 py-3 font-prism",
        className
      )}
    >
      {type === "loading" ? (
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-prism-line-strong border-t-prism-nav motion-reduce:animate-none"
        />
      ) : (
        Icon && <Icon className={cn("h-[21px] w-[21px] shrink-0", iconColor)} aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-[16px] leading-6 text-prism-ink">
        {title && <div className="font-semibold">{title}</div>}
        {description && <div className="text-prism-ink-2">{description}</div>}
      </div>
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="prism-focus -mr-2 inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
        >
          <span className="sr-only">Dismiss</span>
          <X className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
}

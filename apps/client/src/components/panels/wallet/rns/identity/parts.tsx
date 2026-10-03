import { Bell, BellRing, Loader2 } from "lucide-react";
import { Button, cn } from "@repo/ui";
import { useIdentityInterest } from "./useIdentityInterest";

// Parts shared by the RNS name page Identity, Attributes and Facets tabs
// (Screen Review 103 to 106).

/** Section eyebrow: 13 600 caps with the nav marker (103 I06). */
export function IdEyebrow({
  children,
  as: Tag = "p",
}: {
  children: React.ReactNode;
  as?: "p" | "h3";
}) {
  return (
    <Tag className="flex items-center gap-2 font-prism text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </Tag>
  );
}

/** 105 I03: the Soon pill on a tab label and the Coming soon pill in a hero. */
export function SoonPill({
  children = "Soon",
  className,
}: {
  children?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[21px] shrink-0 items-center rounded-full bg-prism-nav-tint px-2 text-prism-meta font-semibold text-prism-nav-pressed",
        className
      )}
    >
      {children}
    </span>
  );
}

/** 104 I05: a meta cell, label 13/16 over value 16/20 600. */
export function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-prism-meta text-prism-ink-2">{label}</dt>
      <dd className="mt-1 flex min-h-touch items-center gap-1 text-prism-label font-semibold tabular-nums text-prism-ink">
        {children}
      </dd>
    </div>
  );
}

/**
 * Screen Review 105 I04: Notify me, saved on the server. Default, saving, on
 * (with Turn off) and error (with Retry).
 */
export function NotifyMe({ source }: { source: "attributes" | "facets" }) {
  const { query, mutation } = useIdentityInterest();
  const on = query.data?.on === true;
  const saving = mutation.isPending;
  const set = (next: boolean) => mutation.mutate({ on: next, source });

  if (query.isPending) {
    return (
      <span
        aria-hidden
        className="block h-touch w-36 rounded-full bg-prism-line motion-safe:animate-pulse"
      />
    );
  }

  if (mutation.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="alert">
        <p className="text-prism-meta text-prism-danger">Could not save. Try again.</p>
        <Button type="button" variant="ghost" onClick={() => set(mutation.variables?.on ?? true)}>
          Retry
        </Button>
      </div>
    );
  }

  if (on) {
    return (
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <BellRing aria-hidden className="h-[21px] w-[21px] shrink-0 fill-current text-prism-nav" />
        <p className="text-prism-meta text-prism-ink-2">
          On. We will email you when attributes and facets open.
        </p>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => set(false)}>
          Turn off
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="-ml-3"
      disabled={saving}
      aria-busy={saving}
      onClick={() => set(true)}
    >
      {saving ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : <Bell aria-hidden />}
      Notify me
    </Button>
  );
}

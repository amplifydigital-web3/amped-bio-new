import { useId, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Blocks, MessageCircle } from "lucide-react";
import { Button, TESTNET_NOTICE, cn } from "@repo/ui";
import { HOME_CONVERSION_COPY, NETWORK_LINKS, TESTNET_PARAGRAPHS } from "./homeContent";

// Screen Review 016 I06 to I11 (Trust rule). The solid compliance notice: the
// verbatim testnet line first, then Read more for the longer text in place.

export function Eyebrow({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
      {children}
    </h2>
  );
}

export function TestnetCard() {
  const [open, setOpen] = useState(false);
  const moreId = useId();
  const paragraphs = [
    TESTNET_PARAGRAPHS.testing,
    ...(HOME_CONVERSION_COPY
      ? [TESTNET_PARAGRAPHS.conversionScope, TESTNET_PARAGRAPHS.tradability]
      : []),
    TESTNET_PARAGRAPHS.thanks,
  ];

  return (
    <section aria-labelledby={`${moreId}-title`} className="prism-notice flex gap-3 p-[21px]">
      <AlertTriangle
        aria-hidden
        className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
      />
      <div className="min-w-0 flex-1 text-prism-body text-prism-ink">
        <h2 id={`${moreId}-title`} className="font-bold text-prism-warning-ink">
          Testnet
        </h2>
        <p>{TESTNET_NOTICE}</p>
        {HOME_CONVERSION_COPY && <p className="mt-[13px]">{TESTNET_PARAGRAPHS.conversion}</p>}
        <div id={moreId} hidden={!open} className="mt-[13px] space-y-[13px]">
          {paragraphs.map(text => (
            <p key={text}>{text}</p>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          aria-controls={moreId}
          onClick={() => setOpen(value => !value)}
          className="-ml-3 mt-2"
        >
          {open ? "Show less" : "Read more"}
          <ChevronDown
            aria-hidden
            className={cn(
              "transition-transform duration-prism-control motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </Button>
      </div>
    </section>
  );
}

const NETWORK_ICONS = { explorer: Blocks, telegram: MessageCircle } as const;

/** 016 I09, I10: two G0 rows that open in a new tab. */
export function NetworkSection({ className }: { className?: string }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("space-y-2", className)}>
      <Eyebrow id={titleId}>Network</Eyebrow>
      <ul>
        {NETWORK_LINKS.map(link => {
          const Icon = NETWORK_ICONS[link.id];
          return (
            <li key={link.id} className="border-b border-prism-line last:border-b-0">
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="prism-focus flex min-h-commit items-center gap-3 rounded-prism-13 px-2 py-2"
              >
                <Icon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block text-prism-label font-semibold text-prism-ink">
                    {link.label}
                  </span>
                  <span className="block truncate text-prism-meta text-prism-ink-2">
                    {link.value}
                  </span>
                </span>
                <ExternalLink aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

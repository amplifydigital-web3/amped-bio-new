import { BROADCAST_FOOTER, parseBroadcastBody, type BroadcastInline } from "@repo/constants";
import { cn } from "@repo/ui";

function Inline({ token }: { token: BroadcastInline }) {
  switch (token.type) {
    case "bold":
      return <strong className="font-bold">{token.text}</strong>;
    case "italic":
      return <em>{token.text}</em>;
    case "link":
      return (
        <a
          href={token.href}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="prism-focus rounded-prism-5 font-semibold text-prism-nav underline underline-offset-4"
        >
          {token.text}
        </a>
      );
    default:
      return <>{token.text}</>;
  }
}

/**
 * The broadcast body: the Markdown subset rendered as React text nodes. No HTML
 * from the creator ever reaches the DOM (spec 3.8, sanitizing).
 */
export function BroadcastBody({ body, className }: { body: string; className?: string }) {
  const paragraphs = parseBroadcastBody(body);
  return (
    <div className={cn("space-y-4 break-words text-prism-body text-prism-ink", className)}>
      {paragraphs.map((lines, i) => (
        <p key={i}>
          {lines.map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line.map((t, k) => (
                <Inline key={k} token={t} />
              ))}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

/** Fixed footer. The creator cannot edit or remove it (acceptance 19). */
export function BroadcastFooter({ creatorName }: { creatorName: string }) {
  return (
    <p className="border-t border-prism-line pt-3 text-prism-meta text-prism-ink-3">
      {BROADCAST_FOOTER(creatorName)}
    </p>
  );
}

export function Avatar({
  name,
  src,
  size = 44,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover shadow-[0_0_0_1px_rgba(22,21,43,0.10)]"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-prism-nav-tint font-bold text-prism-nav"
      style={{ width: size, height: size, fontSize: size / 2.75 }}
    >
      {initials || "?"}
    </span>
  );
}

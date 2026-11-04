import { MESSAGE_UI } from "@repo/constants";
import { cn } from "@repo/ui";
import { Avatar } from "../broadcast/shared";
import { linkParts } from "./util";

export type Relation = "member" | "poolFan" | "follower" | "youFollow" | null;

export function PersonAvatar({
  person,
  size = 44,
}: {
  person: { name: string; image?: string | null } | null;
  size?: number;
}) {
  return <Avatar name={person?.name ?? "?"} src={person?.image ?? null} size={size} />;
}

/** Relation chip beside a name: Member, Pool fan, Follows you or You follow. */
export function RelationLabel({ relation, className }: { relation: Relation; className?: string }) {
  if (!relation) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full bg-prism-nav-tint px-2 py-0.5 text-prism-meta font-semibold text-prism-nav-pressed",
        className
      )}
    >
      {MESSAGE_UI.relation[relation]}
    </span>
  );
}

/** Message text with links. In a request (linksOff) links stay plain text (spec 8.2 item 6). */
export function MessageText({
  text,
  linksOff,
  mine,
}: {
  text: string;
  linksOff: boolean;
  mine: boolean;
}) {
  return (
    <>
      {linkParts(text).map((part, i) =>
        part.href && !linksOff ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className={cn(
              "prism-focus rounded-prism-5 font-semibold underline underline-offset-4 [overflow-wrap:anywhere]",
              mine ? "text-white" : "text-prism-nav"
            )}
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

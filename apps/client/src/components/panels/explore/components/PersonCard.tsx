import { useId, useState } from "react";
import { ChevronDown, ExternalLink, Pencil, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { Link } from "react-router";
import {
  Badge,
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  RnsVerifiedMark,
  type RouterOutputs,
} from "@repo/ui";
import { getPlatformIcon, getPlatformName } from "@/utils/platforms";

export type Person = RouterOutputs["user"]["getUsers"]["users"][number];

export type PersonActions = {
  busy: boolean;
  onFollow: (person: Person) => void;
  onUnfollow: (person: Person) => void;
};

const numberFormat = new Intl.NumberFormat("en-US");
const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
const PLATFORM_MARKS_MAX = 4;

export function pageUrl(handle: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}`;
}

/** 042 I05. A circle with a line ring; the first letter on the lens disc when there is no photo or it fails. */
export function PersonAvatar({ person, size = 55 }: { person: Person; size?: 34 | 55 }) {
  const [failed, setFailed] = useState(false);
  const letter = (person.displayName.trim() || person.username || "?").charAt(0).toUpperCase();
  const box = size === 55 ? "h-[55px] w-[55px]" : "h-[34px] w-[34px] text-prism-label";

  if (person.avatar && !failed) {
    return (
      <img
        src={person.avatar}
        alt=""
        onError={() => setFailed(true)}
        className={`${box} shrink-0 rounded-full object-cover shadow-[0_0_0_1px_rgba(22,21,43,0.10)]`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFFFFF_0%,#F1F0F9_100%)] font-bold text-prism-nav-pressed shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)] ${
        size === 55 ? "text-prism-panel-title" : ""
      }`}
    >
      {letter}
    </span>
  );
}

/** Name, the verified mark when the page shows one, then @handle and the RNS name. */
export function PersonName({ person, nameId }: { person: Person; nameId?: string }) {
  const verified = person.rns?.chip === "verified";
  return (
    <>
      <span
        id={nameId}
        title={person.displayName}
        className="flex min-w-0 items-center gap-1 text-prism-label font-bold text-prism-ink"
      >
        <span className="truncate">{person.displayName}</span>
        {verified && (
          <>
            <RnsVerifiedMark className="h-4 w-4 text-prism-nav" />
            <span className="sr-only">, verified</span>
          </>
        )}
      </span>
      <span className="block truncate text-prism-meta text-prism-ink-2">
        @{person.username}
        {person.rns?.name && <> · {person.rns.name}</>}
      </span>
    </>
  );
}

/** Up to four platform marks from the page's link and media blocks, then a count. */
export function PlatformMarks({ person }: { person: Person }) {
  if (person.platforms.length === 0) return null;
  const shown = person.platforms.slice(0, PLATFORM_MARKS_MAX);
  const more = person.platforms.length - shown.length;
  return (
    <ul className="flex items-center gap-[5px]" aria-label="Also on">
      {shown.map(platform => {
        const Icon = getPlatformIcon(platform);
        return (
          <li
            key={platform}
            title={getPlatformName(platform)}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-prism-13 bg-white/90 text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]"
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            <span className="sr-only">{getPlatformName(platform)}</span>
          </li>
        );
      })}
      {more > 0 && (
        <li className="text-prism-meta font-semibold text-prism-ink-2 tabular-nums">+{more}</li>
      )}
    </ul>
  );
}

/** Follow (primary), Following (secondary, with Unfollow), or Edit page for the owner. */
export function FollowAction({
  person,
  actions,
  className = "",
}: {
  person: Person;
  actions: PersonActions;
  className?: string;
}) {
  const viewer = person.viewer;
  if (!viewer) return null;
  if (viewer.isOwner) {
    return (
      <Button variant="secondary" asChild className={className}>
        <Link to="/page">
          <Pencil aria-hidden />
          Edit page
        </Link>
      </Button>
    );
  }
  if (!viewer.following) {
    return (
      <Button
        onClick={() => actions.onFollow(person)}
        disabled={actions.busy}
        aria-busy={actions.busy || undefined}
        className={`prism-swap ${className}`}
      >
        <UserPlus aria-hidden />
        Follow
      </Button>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" disabled={actions.busy} className={`prism-swap ${className}`}>
          <UserCheck aria-hidden className="!text-prism-success" />
          Following
          <ChevronDown aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-[233px]">
        <MenuItem onSelect={() => actions.onUnfollow(person)}>
          <UserMinus aria-hidden />
          Unfollow
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="min-w-0 flex-1">
      <b className="block text-prism-label font-semibold text-prism-ink tabular-nums">
        {numberFormat.format(value)}
      </b>
      <small className="block text-prism-meta text-prism-ink-2">{label}</small>
    </span>
  );
}

/**
 * Explore person card, concept A (Explore person cards build). G1 clear card:
 * the creator's page background as an 89 cover, the avatar over its edge,
 * name with the verified mark, @handle and RNS name, two line bio, chips,
 * figures the creator already shows on their page, platform marks, then
 * Follow and Open page. Rest CLEAR, hover ILLUMINATED (144ms), press
 * REFRACTED (89ms) on the Open page link only; the card itself is not a link
 * because it holds buttons.
 */
export function PersonCard({ person, actions }: { person: Person; actions: PersonActions }) {
  const nameId = useId();
  const cover = person.cover;
  const viewer = person.viewer;
  const chips: { key: string; label: string; variant: "secondary" | "success" | "outline" }[] = [];
  if (person.showCount && person.newOnAmped) {
    chips.push({ key: "new", label: "New on Amped", variant: "secondary" });
  }
  if (viewer?.poolFan) chips.push({ key: "poolFan", label: "Pool fan", variant: "success" });
  chips.push({
    key: "joined",
    label: `Joined ${monthFormat.format(new Date(person.joinedAt))}`,
    variant: "outline",
  });

  return (
    <article
      aria-labelledby={nameId}
      className="prism-glass-clear relative flex h-full flex-col gap-[13px] overflow-hidden p-[21px] font-prism"
    >
      {/* The creator's own background, bleeding to the card edge. Falls back to the nav tint. */}
      <div
        aria-hidden
        className="-mx-[21px] -mt-[21px] h-[89px] shrink-0 bg-prism-nav-tint bg-cover bg-center"
        style={
          cover?.kind === "color"
            ? { background: cover.css }
            : cover?.kind === "image"
              ? { backgroundImage: `url("${cover.url}")` }
              : undefined
        }
      />
      <div className="-mt-[47px] flex items-end gap-[13px]">
        <span className="rounded-full bg-white p-[3px] shadow-[0_3px_8px_rgba(22,21,43,0.14)]">
          <PersonAvatar person={person} />
        </span>
        <div className="min-w-0 flex-1 pb-1">
          <PersonName person={person} nameId={nameId} />
        </div>
      </div>

      {person.bio && <p className="line-clamp-2 text-prism-meta text-prism-ink-2">{person.bio}</p>}

      <div className="flex flex-wrap gap-[5px]">
        {chips.map(chip => (
          <Badge key={chip.key} variant={chip.variant}>
            {chip.label}
          </Badge>
        ))}
      </div>

      {/* Figures the creator already shows on their page. No stake amount here (no testnet line on the grid). */}
      <div className="flex gap-2 border-t border-prism-line pt-[13px]">
        {person.followerCount !== null && <Stat value={person.followerCount} label="followers" />}
        {person.pool && <Stat value={person.pool.fans} label="fans in pool" />}
        {person.linkCount > 0 && <Stat value={person.linkCount} label="links" />}
        {person.mediaCount > 0 && <Stat value={person.mediaCount} label="media" />}
        {person.followerCount === null &&
          !person.pool &&
          person.linkCount === 0 &&
          person.mediaCount === 0 && (
            <span className="text-prism-meta text-prism-ink-2">Page just published</span>
          )}
      </div>

      <PlatformMarks person={person} />

      <div className="mt-auto flex gap-2 pt-1">
        <FollowAction person={person} actions={actions} className="min-w-0 flex-1" />
        <Button
          variant="secondary"
          size={viewer ? "icon" : "default"}
          asChild
          className={viewer ? "" : "flex-1"}
        >
          <a
            href={pageUrl(person.username)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open @${person.username}'s page (opens in a new tab)`}
          >
            <ExternalLink aria-hidden />
            {!viewer && "Open page"}
          </a>
        </Button>
      </div>
    </article>
  );
}

/**
 * Explore person row, concept E. G0 flat row on the room: 34 avatar, name and
 * handle, the first line of the bio, then followers and fans as tabular
 * figures and the follow action. Phones drop the figures.
 */
export function PersonRow({ person, actions }: { person: Person; actions: PersonActions }) {
  const nameId = useId();
  const figures: string[] = [];
  if (person.followerCount !== null)
    figures.push(`${numberFormat.format(person.followerCount)} followers`);
  else if (person.showCount && person.newOnAmped) figures.push("New on Amped");
  if (person.pool) figures.push(`${numberFormat.format(person.pool.fans)} fans`);

  return (
    <div
      aria-labelledby={nameId}
      className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-[13px] border-b border-prism-line py-2 font-prism last:border-b-0"
    >
      <PersonAvatar person={person} size={34} />
      <div className="min-w-0">
        <PersonName person={person} nameId={nameId} />
        {person.bio && (
          <span className="hidden truncate text-prism-meta text-prism-ink-2 sm:block">
            {person.bio}
          </span>
        )}
      </div>
      <div className="flex items-center gap-[13px]">
        {figures.length > 0 && (
          <span className="hidden text-prism-meta text-prism-ink-2 tabular-nums md:block">
            {figures.join(" · ")}
          </span>
        )}
        {person.viewer?.poolFan && (
          <Badge variant="success" className="hidden sm:inline-flex">
            Pool fan
          </Badge>
        )}
        <FollowAction person={person} actions={actions} />
        <Button variant="secondary" size="icon" asChild className="hidden sm:inline-flex">
          <a
            href={pageUrl(person.username)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open @${person.username}'s page (opens in a new tab)`}
          >
            <ExternalLink aria-hidden />
          </a>
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_FOLLOWERS_CONFIG,
  FOLLOW_LABEL_MAX,
  FOLLOWERS_TITLE_MAX,
  blockCarriesFollow,
  type BlockType,
  type FollowBlock,
  type FollowersBlock,
  type FollowersBlockConfig,
} from "@repo/constants";
import { Button, Checkbox, ChipGroup, Notice, trpc } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { FieldError } from "./LinkFields";
import { wellClass } from "./linkValue";
import type { ConfigChange } from "./BlockFields";

// Follow block and Followers block fields (Build Board #30, spec 3.7, boards
// fb3 and fb5). One column on the G2 slab. Every valid change goes to the
// editor state at once (the preview updates) and autosaves 800 ms later
// (D11). Checkboxes are 24 with labels and helpers, no switches (087 D1).

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </p>
  );
}

function TextField({
  id,
  label,
  value,
  max,
  helper,
  error,
  autoFocus,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  helper: string;
  error: string | null;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-prism-label font-semibold text-prism-ink">
        {label}
      </label>
      <div className={wellClass(!!error)}>
        <input
          id={id}
          autoFocus={autoFocus}
          maxLength={max}
          value={value}
          onChange={event => onChange(event.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : `${id}-help`}
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
        />
      </div>
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : (
        <p id={`${id}-help`} className="flex justify-between text-prism-meta text-prism-ink-2">
          <span>{helper}</span>
          <span className="tabular-nums">
            {value.length} / {max}
          </span>
        </p>
      )}
    </div>
  );
}

export function FollowBlockFields({
  config,
  onValid,
}: {
  config: FollowBlock["config"];
  onValid: ConfigChange;
}) {
  const [label, setLabel] = useState(config.label ?? "Follow");
  const error = label.trim() ? null : "Add a label, for example Follow";
  return (
    <TextField
      id="follow-label"
      label="Label"
      value={label}
      max={FOLLOW_LABEL_MAX}
      helper="Reads Following once someone follows you"
      error={error}
      onChange={next => {
        setLabel(next);
        if (next.trim()) onValid({ ...config, label: next.trim() });
      }}
    />
  );
}

/** A 24 checkbox with its label and a 13/16 helper line. */
function ShowRow({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  helper: string;
}) {
  return (
    <Checkbox checked={checked} onCheckedChange={onChange}>
      {label}
      <span className="mt-1 block text-prism-meta text-prism-ink-2">{helper}</span>
    </Checkbox>
  );
}

const GROWTH_OPTIONS = [
  { value: "7d" as const, label: "7 days" },
  { value: "30d" as const, label: "30 days" },
];
const ORDER_OPTIONS = [
  { value: "newest" as const, label: "Newest" },
  { value: "longest" as const, label: "Longest" },
  { value: "poolFans" as const, label: "Pool fans first" },
];
const MAX_OPTIONS = [
  { value: "6" as const, label: "6" },
  { value: "12" as const, label: "12" },
];

export function FollowersBlockFields({
  block,
  onValid,
}: {
  block: FollowersBlock;
  onValid: ConfigChange;
}) {
  const navigate = useNavigate();
  // Every block on the page, for the two Follow buttons notice
  const { profile, blocks } = useEditor();
  const config: FollowersBlockConfig = { ...DEFAULT_FOLLOWERS_CONFIG, ...block.config };
  const [title, setTitle] = useState(config.title);
  const titleError = title.trim() ? null : "Add a title, for example Followers";

  // The creator's own count state, for the two notices (3.7). The public
  // procedure applies the same floor and hidden rules the preview shows.
  const { data } = useQuery(
    trpc.follow.blockData.queryOptions(
      { handle: profile.handle, growthRange: "7d", facesOrder: "newest", facesMax: 6 },
      { enabled: !!profile.handle, retry: 1, staleTime: 30_000 }
    )
  );
  const countHidden = data ? !data.showCount : false;
  const underFloor = data ? data.showCount && data.newOnAmped : false;
  const otherFollowOn = blocks.some(
    other => other.id !== block.id && other.type === "follow" && blockCarriesFollow(other)
  );
  const twoButtons = config.followButton && otherFollowOn;

  const push = (patch: Partial<FollowersBlockConfig>) => {
    const next = { ...config, ...patch, hidden: block.config.hidden };
    onValid(next as BlockType["config"]);
  };
  const pushShow = (key: keyof FollowersBlockConfig["show"], value: boolean) =>
    push({ show: { ...config.show, [key]: value } });

  return (
    <div className="space-y-[21px]">
      {countHidden && (
        <Notice variant="info" className="rounded-prism-13">
          <p>
            Your follower count is hidden. Visitors see the people who chose to appear and the
            Follow button.
          </p>
          <Button variant="ghost" className="mt-2" onClick={() => navigate("/people")}>
            Open People
          </Button>
        </Notice>
      )}
      {underFloor && (
        <Notice variant="info" className="rounded-prism-13">
          <p>Visitors see New on Amped until you reach 10 followers.</p>
        </Notice>
      )}
      {twoButtons && (
        <Notice variant="info" className="rounded-prism-13">
          <p>Two Follow buttons are on your page.</p>
          <Button variant="ghost" className="mt-2" onClick={() => push({ followButton: false })}>
            Turn off in this card
          </Button>
        </Notice>
      )}

      <TextField
        id="followers-title"
        label="Title"
        value={title}
        max={FOLLOWERS_TITLE_MAX}
        helper="The card heading on your page"
        error={titleError}
        onChange={next => {
          setTitle(next);
          if (next.trim()) push({ title: next.trim() });
        }}
      />

      <div className="space-y-2">
        <Eyebrow>Show</Eyebrow>
        <ShowRow
          checked={config.show.count}
          onChange={value => pushShow("count", value)}
          label="Follower count and growth"
          helper="Hidden under 10 followers"
        />
        <ShowRow
          checked={config.show.faces}
          onChange={value => pushShow("faces", value)}
          label="People who chose to appear"
          helper="Only followers who ticked Show me on public lists"
        />
        <ShowRow
          checked={config.show.poolFans}
          onChange={value => pushShow("poolFans", value)}
          label="Pool fans"
          helper="Followers who also stake in your pool"
        />
        <ShowRow
          checked={config.show.milestone}
          onChange={value => pushShow("milestone", value)}
          label="Milestone"
          helper="100, 500, 1K and up"
        />
        <ShowRow
          checked={config.show.sources}
          onChange={value => pushShow("sources", value)}
          label="Where followers come from"
          helper="Your page, Explore, QR code"
        />
      </div>

      {config.show.count && (
        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">Growth period</p>
          <ChipGroup
            label="Growth period"
            value={config.growthRange}
            onChange={value => push({ growthRange: value })}
            options={GROWTH_OPTIONS}
          />
        </div>
      )}

      {config.show.faces && (
        <div className="space-y-[13px]">
          <div className="space-y-2">
            <p className="text-prism-label font-semibold text-prism-ink">Order</p>
            <ChipGroup
              label="Faces order"
              value={config.facesOrder}
              onChange={value => push({ facesOrder: value })}
              options={ORDER_OPTIONS}
            />
          </div>
          <div className="space-y-2">
            <p className="text-prism-label font-semibold text-prism-ink">Show</p>
            <ChipGroup
              label="Faces shown"
              value={String(config.facesMax) as "6" | "12"}
              onChange={value => push({ facesMax: value === "12" ? 12 : 6 })}
              options={MAX_OPTIONS}
            />
          </div>
        </div>
      )}

      <ShowRow
        checked={config.followButton}
        onChange={value => push({ followButton: value })}
        label="Follow button in this card"
        helper="Turn off if you added a Follow button block"
      />
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  DEFAULT_RNSID_CONFIG,
  RNSID_LABEL_MAX,
  rnsIdTapsFor,
  type BlockType,
  type RnsIdBlock,
  type RnsIdBlockConfig,
  type RnsIdBlockStyle,
  type RnsIdBlockTap,
} from "@repo/constants";
import { Button, Checkbox, ChipGroup, Notice, Skeleton } from "@repo/ui";
import { FieldError } from "./LinkFields";
import { wellClass } from "./linkValue";
import type { ConfigChange } from "./BlockFields";
import { useMyPageIdentity } from "../rns/useMyPageIdentity";

// RNS ID block fields (Build Board #33, Screen Review 112, board 3). One
// column on the G2 slab. Every valid change goes to the editor state at once
// (the preview updates) and autosaves 800 ms later (D11). The name, the
// Verified badge and the sheet details are set once in Page > RNS (108) and
// read here; the block adds only style, tap, label and its own show map
// (112 D2).

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </p>
  );
}

/** A 24 checkbox with its label and a 13/16 helper line. */
function ShowRow({
  checked,
  onChange,
  label,
  helper,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  helper: string;
  disabled?: boolean;
}) {
  return (
    <Checkbox checked={checked} onCheckedChange={onChange} disabled={disabled}>
      {label}
      <span className="mt-1 block text-prism-meta text-prism-ink-2">{helper}</span>
    </Checkbox>
  );
}

const STYLE_OPTIONS: { value: RnsIdBlockStyle; label: string }[] = [
  { value: "nameplate", label: "Nameplate" },
  { value: "idcard", label: "ID Card" },
  { value: "proofstrip", label: "Proof Strip" },
  { value: "seal", label: "Seal" },
];

const TAP_LABELS: Record<RnsIdBlockTap, string> = {
  sheet: "Open the identity sheet",
  inline: "Expand in place",
  none: "Nothing",
};

export function RnsIdBlockFields({ block, onValid }: { block: RnsIdBlock; onValid: ConfigChange }) {
  const navigate = useNavigate();
  const identity = useMyPageIdentity();
  const config: RnsIdBlockConfig = {
    ...DEFAULT_RNSID_CONFIG,
    ...block.config,
    show: { ...DEFAULT_RNSID_CONFIG.show, ...block.config.show },
  };
  const [label, setLabel] = useState(config.label);
  const labelError = label.trim() ? null : "Add a label, for example Identity";

  const data = identity.data;
  const linked = data?.nameState === "linked";
  const verified = data?.verification?.state === "verified";
  const showsBadge = verified && data?.display.showBadge !== false;
  const onPage = linked && data?.display.showName !== false;
  const nameOnIdAvailable = !!data?.nameOnIdAvailable;

  const push = (patch: Partial<RnsIdBlockConfig>) => {
    const next = { ...config, ...patch, hidden: block.config.hidden };
    onValid(next as BlockType["config"]);
  };
  const pushShow = (key: keyof RnsIdBlockConfig["show"], value: boolean) =>
    push({ show: { ...config.show, [key]: value } });
  const setStyle = (style: RnsIdBlockStyle) => {
    const taps = rnsIdTapsFor(style);
    push({ style, tap: taps.includes(config.tap) ? config.tap : "sheet" });
  };

  const hasLabel = config.style === "idcard" || config.style === "proofstrip";
  const tapOptions = rnsIdTapsFor(config.style).map(value => ({
    value,
    label: TAP_LABELS[value],
  }));

  // 112 D4: what the page shows now, from the same read the preview uses
  let state: React.ReactNode = null;
  if (identity.isPending) {
    state = <Skeleton className="h-4 w-2/3 rounded-prism-8" />;
  } else if (!data?.label) {
    state = (
      <Notice variant="info" className="rounded-prism-13">
        <p>
          Choose an RNS name in Page, Revolution Name Service. The block shows once a name points to
          this page.
        </p>
        <Button variant="ghost" className="mt-2" onClick={() => navigate("/page")}>
          Open RNS settings
        </Button>
      </Notice>
    );
  } else if (!linked) {
    state = (
      <Notice variant="warning" className="rounded-prism-13">
        <p>
          {data.nameState === "expired"
            ? `${data.name} expired, so this block is off your page until you renew it.`
            : `${data.name} does not point to this page, so this block is off your page.`}
        </p>
        <Button variant="ghost" className="mt-2" onClick={() => navigate("/wallet?tab=rns")}>
          Manage in Wallet
        </Button>
      </Notice>
    );
  } else if (!onPage) {
    state = (
      <Notice variant="info" className="rounded-prism-13">
        <p>
          Show on my page is off in Page, Revolution Name Service, so this block is off your page.
        </p>
        <Button variant="ghost" className="mt-2" onClick={() => navigate("/page")}>
          Open RNS settings
        </Button>
      </Notice>
    );
  } else if (!verified) {
    state = (
      <Notice variant="info" className="rounded-prism-13">
        <p>
          Fans see {data.name} as a linked name. Verify with Authbase to show the Verified chip and
          your name on ID.
        </p>
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() =>
            navigate(`/wallet?tab=rns&name=${encodeURIComponent(data.label ?? "")}&view=identity`)
          }
        >
          Get verified
        </Button>
      </Notice>
    );
  } else if (!showsBadge) {
    state = (
      <Notice variant="info" className="rounded-prism-13">
        <p>
          Show Verified badge is off in Page, Revolution Name Service, so the block reads Linked
          name.
        </p>
        <Button variant="ghost" className="mt-2" onClick={() => navigate("/page")}>
          Open RNS settings
        </Button>
      </Notice>
    );
  }

  return (
    <div className="space-y-[21px]">
      {state}

      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Style</p>
        <ChipGroup label="Style" value={config.style} onChange={setStyle} options={STYLE_OPTIONS} />
      </div>

      {hasLabel && (
        <div className="space-y-2">
          <label
            htmlFor="rnsid-label"
            className="block text-prism-label font-semibold text-prism-ink"
          >
            Label
          </label>
          <div className={wellClass(!!labelError)}>
            <input
              id="rnsid-label"
              maxLength={RNSID_LABEL_MAX}
              value={label}
              onChange={event => {
                setLabel(event.target.value);
                if (event.target.value.trim()) push({ label: event.target.value.trim() });
              }}
              aria-invalid={!!labelError || undefined}
              aria-describedby={labelError ? "rnsid-label-error" : "rnsid-label-help"}
              className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
            />
          </div>
          {labelError ? (
            <FieldError id="rnsid-label-error">{labelError}</FieldError>
          ) : (
            <p
              id="rnsid-label-help"
              className="flex justify-between text-prism-meta text-prism-ink-2"
            >
              <span>The eyebrow on the card</span>
              <span className="tabular-nums">
                {label.length} / {RNSID_LABEL_MAX}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Eyebrow>What fans can see</Eyebrow>
        <ShowRow
          checked={config.show.nameOnId}
          onChange={value => pushShow("nameOnId", value)}
          label="Name on ID"
          helper={
            !verified
              ? "Needs a current Authbase check"
              : nameOnIdAvailable
                ? "The name Authbase checked. Verified pages only"
                : "Not available yet"
          }
          disabled={!verified || !nameOnIdAvailable}
        />
        <ShowRow
          checked={config.show.displayName}
          onChange={value => pushShow("displayName", value)}
          label="Display name"
          helper="ID Card"
        />
        <ShowRow
          checked={config.show.avatar}
          onChange={value => pushShow("avatar", value)}
          label="Avatar"
          helper="ID Card"
        />
        <ShowRow
          checked={config.show.since}
          onChange={value => pushShow("since", value)}
          label="On Amped since"
          helper="The month you joined"
        />
        <p className="pt-1 text-prism-meta text-prism-ink-2">
          The Verified chip and Show details follow your settings in Page, Revolution Name Service.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">What a tap does</p>
        <ChipGroup
          label="What a tap does"
          value={config.tap}
          onChange={tap => push({ tap })}
          options={tapOptions}
        />
      </div>
    </div>
  );
}

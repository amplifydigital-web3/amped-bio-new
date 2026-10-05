import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlertCircle, Check, ExternalLink } from "lucide-react";
import { cn } from "@repo/ui";
import { wellClass, type LinkValue } from "./linkValue";
import { getPlatformIcon, getPlatformName } from "@/utils/platforms";
import {
  LINK_PLATFORM_GROUPS,
  LINK_PLATFORMS,
  defaultLabel,
  detectLink,
  isSocial,
  linkError,
  platformPrefix,
  resolveLink,
} from "./blockInfo";

// Screen Review 034 and 037 I08. One Link field that takes a URL, a username
// or an email; the platform is detected and shown as a chip the creator can
// change; the Label fills itself until the creator types in it.

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-prism-meta text-prism-danger">
      <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
      {children}
    </p>
  );
}

function PlatformList({ value, onPick }: { value: string; onPick: (platform: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LINK_PLATFORM_GROUPS.map(group => ({
      label: group.label,
      items: group.ids
        .map(id => LINK_PLATFORMS.find(p => p.id === id))
        .filter((p): p is (typeof LINK_PLATFORMS)[number] => !!p)
        .filter(p => !q || p.name.toLowerCase().includes(q) || p.id.includes(q)),
    })).filter(group => group.items.length > 0);
  }, [query]);
  const flat = filtered.flatMap(group => group.items);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(i => Math.min(flat.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = flat[active];
      if (pick) onPick(pick.id);
    }
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="platform-search"
        className="block text-prism-label font-semibold text-prism-ink"
      >
        Platform
      </label>
      <div className={wellClass(false)}>
        <input
          id="platform-search"
          autoFocus
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls="platform-list"
          aria-activedescendant={flat[active] ? `platform-${flat[active].id}` : undefined}
          placeholder="Search platforms"
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-3"
        />
      </div>
      <ul
        ref={listRef}
        id="platform-list"
        role="listbox"
        aria-label="Platforms"
        className="max-h-[233px] overflow-y-auto"
      >
        {filtered.map(group => (
          <li key={group.label} role="presentation">
            <p className="px-1 pb-1 pt-2 text-prism-eyebrow uppercase text-prism-ink-2">
              {group.label}
            </p>
            <ul role="presentation">
              {group.items.map(platform => {
                const Icon = getPlatformIcon(platform.id);
                const index = flat.indexOf(platform);
                return (
                  <li
                    key={platform.id}
                    id={`platform-${platform.id}`}
                    role="option"
                    aria-selected={platform.id === value}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => onPick(platform.id)}
                    className={cn(
                      "flex h-touch cursor-pointer items-center gap-3 border-b border-prism-line px-2 text-prism-label font-semibold text-prism-ink",
                      index === active && "bg-white/70"
                    )}
                  >
                    <Icon aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
                    <span className="flex-1">{platform.name}</span>
                    {platform.id === value && <Check aria-hidden className="h-4 w-4" />}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LinkFields({
  value,
  onChange,
  onBlur,
  autoFocus = false,
  showOpen = false,
  errorsVisible,
  duplicate,
}: {
  value: LinkValue;
  onChange: (value: LinkValue) => void;
  /** Called when a field loses focus (validate and save) */
  onBlur?: () => void;
  autoFocus?: boolean;
  /** 037 I08: an Open link button beside the field */
  showOpen?: boolean;
  /** Show errors now (after a submit attempt) */
  errorsVisible?: boolean;
  /** 034 I09: this link is already on the page */
  duplicate?: React.ReactNode;
}) {
  const [changing, setChanging] = useState(false);
  const [touched, setTouched] = useState({ link: false, label: false });
  const platform = value.platform;
  const resolved = platform ? resolveLink(platform, value.input) : null;
  const prefix =
    platform && isSocial(platform) && !/^https?:\/\//i.test(value.input)
      ? platformPrefix(platform)
      : "";
  const showLinkError = errorsVisible || (touched.link && value.input !== "");
  const linkMessage = showLinkError ? linkError(platform || "custom", value.input) : null;
  const labelMessage =
    (touched.label || errorsVisible) && !value.label.trim() ? "Add a label for the button" : null;
  const Icon = platform ? getPlatformIcon(platform) : null;

  const onInput = (input: string) => {
    let next = { ...value, input };
    // Detection from a pasted or typed URL (034 I02)
    // A bare username for a chosen social platform is never re-detected
    const looksLikeUrl = /[/:]|^https?/i.test(input) || /@.+\./.test(input);
    const detected = !platform || !isSocial(platform) || looksLikeUrl ? detectLink(input) : null;
    if (detected && (!platform || detected.platform !== platform || !isSocial(platform))) {
      next = { ...next, platform: detected.platform, input: detected.value };
    } else if (!input) {
      next = { ...next, platform: next.labelTouched ? next.platform : "" };
    }
    if (!next.labelTouched && next.platform) {
      next.label = defaultLabel(next.platform, next.input);
    }
    onChange(next);
  };

  return (
    <div className="space-y-[21px]">
      <div className="space-y-2">
        <label htmlFor="link-input" className="block text-prism-label font-semibold text-prism-ink">
          Link
        </label>
        <div className="flex items-center gap-2">
          <div className={cn(wellClass(!!linkMessage), "flex-1")}>
            {prefix && (
              <span aria-hidden className="shrink-0 select-none text-prism-label text-prism-ink-2">
                {prefix}
              </span>
            )}
            <input
              id="link-input"
              autoFocus={autoFocus}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={value.input}
              onChange={event => onInput(event.target.value)}
              onBlur={() => {
                setTouched(t => ({ ...t, link: true }));
                onBlur?.();
              }}
              aria-invalid={!!linkMessage || undefined}
              aria-describedby={linkMessage ? "link-error" : "link-help"}
              placeholder="Paste a link or type a username"
              className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-3"
            />
          </div>
          {showOpen && resolved && (
            <a
              href={resolved}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open link"
              className="prism-icon-btn prism-focus shrink-0"
            >
              <ExternalLink aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
            </a>
          )}
        </div>
        {linkMessage ? (
          <FieldError id="link-error">{linkMessage}</FieldError>
        ) : duplicate ? (
          <p id="link-help" className="text-prism-meta text-prism-ink-2">
            {duplicate}
          </p>
        ) : resolved ? (
          <p id="link-help" className="break-all text-prism-meta text-prism-ink-2">
            {platform === "email"
              ? `Opens an email to ${resolved.replace(/^mailto:/, "")}`
              : `Opens ${resolved}`}
          </p>
        ) : null}
      </div>

      {platform && Icon && (
        <div className="space-y-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="prism-lens-thumb inline-flex h-touch items-center gap-2 rounded-full px-5 text-prism-label font-bold text-prism-nav-pressed">
              <Icon aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
              {getPlatformName(platform)}
              <Check aria-hidden className="h-4 w-4" />
            </span>
            <button
              type="button"
              aria-expanded={changing}
              onClick={() => setChanging(c => !c)}
              className="prism-btn-ghost prism-focus h-touch rounded-prism-13 px-3 text-prism-label font-semibold"
            >
              Change
            </button>
          </div>
          {changing && (
            <PlatformList
              value={platform}
              onPick={picked => {
                setChanging(false);
                const input =
                  picked === platform ? value.input : isSocial(picked) ? "" : value.input;
                onChange({
                  ...value,
                  platform: picked,
                  input,
                  label: value.labelTouched ? value.label : defaultLabel(picked, input),
                });
              }}
            />
          )}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="link-label" className="block text-prism-label font-semibold text-prism-ink">
          Label
        </label>
        <div className={wellClass(!!labelMessage)}>
          <input
            id="link-label"
            value={value.label}
            onChange={event =>
              onChange({ ...value, label: event.target.value, labelTouched: true })
            }
            onBlur={() => {
              setTouched(t => ({ ...t, label: true }));
              onBlur?.();
            }}
            aria-invalid={!!labelMessage || undefined}
            aria-describedby={labelMessage ? "label-error" : "label-help"}
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
          />
        </div>
        {labelMessage ? (
          <FieldError id="label-error">{labelMessage}</FieldError>
        ) : (
          <p id="label-help" className="text-prism-meta text-prism-ink-2">
            Shown on the button.
          </p>
        )}
      </div>
    </div>
  );
}

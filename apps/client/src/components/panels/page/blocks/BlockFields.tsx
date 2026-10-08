import { useEffect, useState } from "react";
import type { BlockType, MediaBlock, PoolBlock, TextBlock } from "@repo/constants";
import SlateEditor from "@/components/blocks/text/TextEditor/SlateEditor";
import { PoolSearchInput } from "@/components/panels/blocks/PoolSearchInput";
import { appChainId } from "@/utils/appChain";
import { FieldError, LinkFields } from "./LinkFields";
import { linkConfig, linkValueFromConfig, wellClass } from "./linkValue";
import { mediaHelp, mediaName, mediaUrlError, stripTags } from "./blockInfo";
import { FollowBlockFields, FollowersBlockFields } from "./FollowBlockFields";

// Screen Review 037. The fields an open block row needs, one column on the G2
// slab. Every valid change goes to the editor state at once (the preview
// updates) and autosaves 800ms later (D11). Invalid input never saves.

export type ConfigChange = (config: BlockType["config"]) => void;

const CAPTION_MAX = 280;

export function LinkBlockFields({
  config,
  onValid,
}: {
  config: { platform: string; url: string; label: string; hidden?: boolean };
  onValid: ConfigChange;
}) {
  const [value, setValue] = useState(() => linkValueFromConfig(config));
  return (
    <LinkFields
      value={value}
      showOpen
      autoFocus={!config.url}
      onChange={next => {
        setValue(next);
        const valid = linkConfig(next);
        if (valid) onValid({ ...valid, hidden: config.hidden } as BlockType["config"]);
      }}
    />
  );
}

export function MediaBlockFields({
  config,
  onValid,
}: {
  config: MediaBlock["config"];
  onValid: ConfigChange;
}) {
  // 037 I06: old Spotify blocks stored the link in content
  const legacyUrl = !config.url && config.content?.startsWith("http") ? config.content : "";
  const [url, setUrl] = useState(config.url || legacyUrl);
  const [caption, setCaption] = useState(legacyUrl ? "" : (config.content ?? ""));
  const [blurred, setBlurred] = useState(false);
  const error = blurred ? mediaUrlError(config.platform, url) : null;
  const name = mediaName(config.platform);

  const push = (nextUrl: string, nextCaption: string) => {
    if (mediaUrlError(config.platform, nextUrl)) return;
    onValid({ ...config, url: nextUrl.trim(), content: nextCaption || undefined });
  };

  return (
    <div className="space-y-[21px]">
      <div className="space-y-2">
        <label htmlFor="media-url" className="block text-prism-label font-semibold text-prism-ink">
          {name} link
        </label>
        <div className={wellClass(!!error)}>
          <input
            id="media-url"
            autoFocus={!config.url}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            value={url}
            onChange={event => {
              setUrl(event.target.value);
              push(event.target.value, caption);
            }}
            onPaste={event => {
              event.preventDefault();
              const pasted = event.clipboardData.getData("text").trim();
              setUrl(pasted);
              push(pasted, caption);
            }}
            onBlur={() => setBlurred(true)}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "media-url-error" : "media-url-help"}
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
          />
        </div>
        {error ? (
          <FieldError id="media-url-error">{error}</FieldError>
        ) : (
          <p id="media-url-help" className="text-prism-meta text-prism-ink-2">
            {mediaHelp(config.platform)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="media-caption"
          className="block text-prism-label font-semibold text-prism-ink"
        >
          Caption (optional)
        </label>
        <textarea
          id="media-caption"
          rows={3}
          maxLength={CAPTION_MAX}
          value={caption}
          onChange={event => {
            setCaption(event.target.value);
            push(url, event.target.value);
          }}
          aria-describedby="media-caption-help"
          className="prism-well prism-focus w-full resize-y p-[13px] text-[16px] leading-[26px] text-prism-ink outline-none"
        />
        <p
          id="media-caption-help"
          className="flex justify-between text-prism-meta text-prism-ink-2"
        >
          <span>Shows under the embed on your page</span>
          <span className="tabular-nums">
            {caption.length} / {CAPTION_MAX}
          </span>
        </p>
      </div>
    </div>
  );
}

export function TextBlockFields({
  config,
  onValid,
}: {
  config: TextBlock["config"];
  onValid: ConfigChange;
}) {
  const [blurred, setBlurred] = useState(false);
  const [empty, setEmpty] = useState(!stripTags(config.content ?? ""));
  const error = blurred && empty ? "Add some text or delete this block" : null;
  return (
    <div className="space-y-2">
      <p id="text-block-label" className="text-prism-label font-semibold text-prism-ink">
        Text
      </p>
      <SlateEditor
        labelId="text-block-label"
        toolbarLabel="Text formatting"
        initialValue={config.content}
        minHeight={144}
        maxHeight={377}
        invalid={!!error}
        describedBy={error ? "text-block-error" : undefined}
        onBlur={() => setBlurred(true)}
        onChange={html => {
          const isEmpty = !stripTags(html);
          setEmpty(isEmpty);
          if (!isEmpty) onValid({ ...config, content: html });
        }}
      />
      {error && <FieldError id="text-block-error">{error}</FieldError>}
    </div>
  );
}

export function PoolBlockFields({
  address,
  label,
  onPick,
}: {
  address: string;
  label: string;
  onPick: (pool: { address: string; name: string }) => void;
}) {
  // 038 I06: the app network, so search works with no wallet or another network
  return (
    <PoolSearchInput
      onPoolSelect={pool => onPick({ address: pool.address, name: pool.name })}
      currentAddress={address}
      currentLabel={label}
      chainId={appChainId()}
    />
  );
}

export function BlockFields({ block, onValid }: { block: BlockType; onValid: ConfigChange }) {
  // Remount the fields when a different block opens
  const [key, setKey] = useState(block.id);
  useEffect(() => setKey(block.id), [block.id]);

  switch (block.type) {
    case "link":
      return <LinkBlockFields key={key} config={block.config} onValid={onValid} />;
    case "media":
      if (block.config.platform === "creator-pool") {
        // 037 I12 (partial): legacy pool media blocks use the same pool search
        return (
          <PoolBlockFields
            address={block.config.url}
            label={block.config.label}
            onPick={pool => onValid({ ...block.config, url: pool.address, label: pool.name })}
          />
        );
      }
      return <MediaBlockFields key={key} config={block.config} onValid={onValid} />;
    case "text":
      return <TextBlockFields key={key} config={block.config} onValid={onValid} />;
    case "pool":
      return (
        <PoolBlockFields
          address={(block as PoolBlock).config.address}
          label={(block as PoolBlock).config.label}
          onPick={pool => onValid({ ...block.config, address: pool.address, label: pool.name })}
        />
      );
    case "referral":
      return (
        <p className="text-[16px] leading-[26px] text-prism-ink-2">
          Shows your Amped.Bio invite link to visitors.
        </p>
      );
    case "follow":
      return <FollowBlockFields key={key} config={block.config} onValid={onValid} />;
    case "followers":
      return <FollowersBlockFields key={key} block={block} onValid={onValid} />;
    default:
      return null;
  }
}

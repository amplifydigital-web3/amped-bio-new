import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_MESSAGE_BLOCK_LABEL,
  MESSAGE_BLOCK_LABEL_MAX,
  MESSAGE_RULE_LABELS,
  MESSAGE_UI,
} from "@repo/constants";
import { Button, Notice, trpc } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { FieldError } from "./LinkFields";
import { wellClass } from "./linkValue";
import type { ConfigChange } from "./BlockFields";

const F = MESSAGE_UI.blockFields;

/**
 * Message me fields (Amped Messages PR M6, spec 8.4, board m6 editor). The label only:
 * who may write is set in Account, Messages, so no rule text is typed here and no
 * amount reaches the page. While the rule is No one (or messages are paused) the row
 * says visitors do not see the button.
 */
export function MessageBlockFields({
  config,
  onValid,
}: {
  config: { label?: string; hidden?: boolean };
  onValid: ConfigChange;
}) {
  const [label, setLabel] = useState(config.label ?? DEFAULT_MESSAGE_BLOCK_LABEL);
  const settings = useQuery({ ...trpc.messages.settings.get.queryOptions(), staleTime: 30_000 });
  const { setActivePanelAndNavigate } = useEditor();
  const closed = settings.data && (settings.data.ruleKind === "NOBODY" || settings.data.paused);
  const error = label.trim() ? null : F.labelRequired;
  const openSettings = () =>
    setActivePanelAndNavigate("account", undefined, { tab: "settings", open: "messages" });

  return (
    <div className="space-y-[21px]">
      {closed && (
        <Notice variant="info" className="rounded-prism-13">
          <p>{F.closed}</p>
          <Button variant="ghost" className="mt-2" onClick={openSettings}>
            {F.openSettings}
          </Button>
        </Notice>
      )}
      <div className="space-y-2">
        <label
          htmlFor="message-block-label"
          className="block text-prism-label font-semibold text-prism-ink"
        >
          {F.label}
        </label>
        <div className={wellClass(!!error)}>
          <input
            id="message-block-label"
            maxLength={MESSAGE_BLOCK_LABEL_MAX}
            value={label}
            onChange={event => {
              setLabel(event.target.value);
              const next = event.target.value.trim();
              if (next) onValid({ ...config, label: next });
            }}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "message-block-label-error" : "message-block-label-help"}
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
          />
        </div>
        {error ? (
          <FieldError id="message-block-label-error">{error}</FieldError>
        ) : (
          <p
            id="message-block-label-help"
            className="flex justify-between text-prism-meta text-prism-ink-2"
          >
            <span>{F.labelHelp}</span>
            <span className="tabular-nums">
              {label.length} / {MESSAGE_BLOCK_LABEL_MAX}
            </span>
          </p>
        )}
      </div>
      {settings.data && !closed && (
        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">{F.whoField}</p>
          <div className="prism-well flex min-h-touch items-center justify-between gap-3 rounded-prism-13 px-[13px]">
            <span className="min-w-0 truncate text-prism-label text-prism-ink">
              {MESSAGE_RULE_LABELS[settings.data.ruleKind]}
            </span>
            <Button variant="ghost" onClick={openSettings}>
              {F.change}
            </Button>
          </div>
          <p className="text-prism-meta text-prism-ink-2">{F.whoNote}</p>
        </div>
      )}
    </div>
  );
}

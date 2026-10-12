import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_TELEGRAM_GROUP_LABEL,
  DEFAULT_TELEGRAM_MESSAGE_LABEL,
  TELEGRAM_APP_STRINGS as S,
  TELEGRAM_BLOCK_LABEL_MAX,
  type TelegramGroupBlock,
  type TelegramMessageBlock,
} from "@repo/constants";
import { Button, Notice, trpc } from "@repo/ui";
import { useOpenTelegramWizard } from "../../messages/shared";
import { FieldError } from "./LinkFields";
import { wellClass } from "./linkValue";
import type { ConfigChange } from "./BlockFields";

/**
 * Message me on Telegram and Join my Telegram group fields (Build Board #2,
 * Screen Review 115, board tg4 editor). The label only: the rule and whether the
 * door is open come from Inbox, Settings, so no rule text is ever typed here.
 * With Fan messages off, the row says visitors do not see the button yet and
 * offers wizard A. The group block waits on Telegram groups (PR 5).
 */
export function TelegramBlockFields({
  block,
  onValid,
}: {
  block: TelegramMessageBlock | TelegramGroupBlock;
  onValid: ConfigChange;
}) {
  const isMessage = block.type === "telegram_message";
  const fallback = isMessage ? DEFAULT_TELEGRAM_MESSAGE_LABEL : DEFAULT_TELEGRAM_GROUP_LABEL;
  const [label, setLabel] = useState(block.config.label ?? fallback);
  const openWizard = useOpenTelegramWizard();
  const settings = useQuery({
    ...trpc.messaging.creator.getSettings.queryOptions(),
    enabled: isMessage,
    staleTime: 30_000,
  });
  const error = label.trim() ? null : S.blockLabelRequired;

  return (
    <div className="space-y-[21px]">
      {isMessage && settings.data && !settings.data.enabled && (
        <Notice variant="info" className="rounded-prism-13">
          <p>{S.blockOffNotice}</p>
          <Button variant="ghost" className="mt-2" onClick={openWizard}>
            {S.blockOffButton}
          </Button>
        </Notice>
      )}
      {!isMessage && (
        <Notice variant="info" className="rounded-prism-13">
          <p>{S.groupBlockSoon}</p>
        </Notice>
      )}
      <div className="space-y-2">
        <label
          htmlFor="telegram-block-label"
          className="block text-prism-label font-semibold text-prism-ink"
        >
          {S.creatorWizard.pageLabelField}
        </label>
        <div className={wellClass(!!error)}>
          <input
            id="telegram-block-label"
            maxLength={TELEGRAM_BLOCK_LABEL_MAX}
            value={label}
            onChange={event => {
              setLabel(event.target.value);
              const next = event.target.value.trim();
              if (next) onValid({ ...block.config, label: next });
            }}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "telegram-block-label-error" : "telegram-block-label-help"}
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
          />
        </div>
        {error ? (
          <FieldError id="telegram-block-label-error">{error}</FieldError>
        ) : (
          <p
            id="telegram-block-label-help"
            className="flex justify-between text-prism-meta text-prism-ink-2"
          >
            <span>{S.blockLabelHelper}</span>
            <span className="tabular-nums">
              {label.length} / {TELEGRAM_BLOCK_LABEL_MAX}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

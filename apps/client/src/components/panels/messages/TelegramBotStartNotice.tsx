import { TELEGRAM_APP_STRINGS as S } from "@repo/constants";
import { Button, Notice } from "@repo/ui";
import { telegramBotLink } from "./shared";

/**
 * Shown while a linked Telegram account cannot get messages from the bot: Start was
 * never pressed (botAccess false) or the bot is blocked. Pressing Start in the bot
 * fixes both (spec 3.5). The status query refetches on focus, so the notice goes
 * away when the user comes back from Telegram.
 */
export function TelegramBotStartNotice({
  botUsername,
  blocked,
}: {
  botUsername: string | null;
  blocked: boolean;
}) {
  return (
    <Notice variant="warning" role="status">
      <p>{blocked ? S.accountBlockedNotice : S.botStartNotice}</p>
      <p className="mt-1">{S.creatorWizard.botKeepChat}</p>
      {botUsername && (
        <Button variant="ghost" className="mt-2" asChild>
          <a href={telegramBotLink(botUsername)} target="_blank" rel="noopener noreferrer">
            {S.openBotButton}
          </a>
        </Button>
      )}
    </Notice>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { TELEGRAM_APP_STRINGS as S } from "@repo/constants";
import { Button, trpc } from "@repo/ui";
import { useOpenTelegramWizard } from "./shared";

/**
 * Home checklist item 6, Add Telegram (Screen Review 123, board tg12, spec 3.11a):
 * the Home Telegram card, shown once the first five setup steps are done and until
 * wizard A step 3 sets `telegram_setup_at`. One primary, Set up Telegram. Hidden
 * while the bot is not set up on this environment.
 */
export function TelegramHomeCard() {
  const openWizard = useOpenTelegramWizard();
  const status = useQuery({ ...trpc.telegram.link.status.queryOptions(), staleTime: 60_000 });
  if (!status.data?.available) return null;
  return (
    <section
      aria-labelledby="telegram-home-title"
      className="prism-glass-clear flex flex-col gap-[13px] rounded-prism-21 p-[21px] font-prism sm:flex-row sm:items-center"
    >
      <span
        aria-hidden
        className="prism-well flex h-[44px] w-[44px] shrink-0 items-center justify-center !rounded-prism-13 text-prism-nav"
      >
        <Send className="h-[21px] w-[21px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="telegram-home-title" className="text-prism-label font-semibold text-prism-ink">
          {S.homeItem}
        </h2>
        <p className="text-prism-body text-prism-ink-2">{S.homeCard.body}</p>
      </div>
      <Button onClick={openWizard} className="max-sm:w-full">
        {S.homeCard.button}
      </Button>
    </section>
  );
}

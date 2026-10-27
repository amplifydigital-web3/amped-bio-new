import { BookOpen, ExternalLink, HelpCircle, LifeBuoy, Send } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@repo/ui";
import { HELP_ARTICLES_URL, TELEGRAM_URL, useSupportWidget } from "./useSupportWidget";

// Screen Review 004 D15. Help rows shared by the desktop Help menu and the
// avatar menu Help sub list: Help articles, Contact support, Community on Telegram.
export function HelpMenuItems({ Item = MenuItem }: { Item?: typeof MenuItem }) {
  const { openContactForm } = useSupportWidget();
  return (
    <>
      <Item asChild>
        <a href={HELP_ARTICLES_URL} target="_blank" rel="noopener noreferrer">
          <BookOpen aria-hidden />
          <span className="flex-1">Help articles</span>
          <ExternalLink aria-hidden className="!h-4 !w-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Item>
      <Item onSelect={openContactForm}>
        <LifeBuoy aria-hidden />
        <span className="flex-1">Contact support</span>
      </Item>
      <Item asChild>
        <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
          <Send aria-hidden />
          <span className="flex-1">Community on Telegram</span>
          <ExternalLink aria-hidden className="!h-4 !w-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Item>
    </>
  );
}

/** Desktop top bar Help: a 44 icon button with the three row menu (I01, I02). */
export function HelpMenu() {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Help"
        className="prism-icon-btn prism-focus data-[state=open]:shadow-[0_0_0_1.5px_#5650A2]"
      >
        <HelpCircle aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" strokeWidth={1.5} />
      </MenuTrigger>
      <MenuContent align="end" className="w-[288px] max-w-[288px]">
        <HelpMenuItems />
      </MenuContent>
    </Menu>
  );
}

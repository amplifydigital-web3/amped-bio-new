/** The invite text used by the share sheet and by every share target. */
export const SHARE_TEXT = "Join me on Amped.Bio. Build your page and earn tREVO on testnet.";

/** Share targets that open in a new tab. Native share comes first when the browser has it. */
export function shareTargets(link: string) {
  const url = encodeURIComponent(link);
  const text = encodeURIComponent(SHARE_TEXT);
  return [
    { id: "x", label: "Share on X", href: `https://x.com/intent/post?text=${text}&url=${url}` },
    {
      id: "telegram",
      label: "Share on Telegram",
      href: `https://t.me/share/url?url=${url}&text=${text}`,
    },
    { id: "whatsapp", label: "Share on WhatsApp", href: `https://wa.me/?text=${text}%20${url}` },
    {
      id: "email",
      label: "Share by email",
      href: `mailto:?subject=${encodeURIComponent("Join me on Amped.Bio")}&body=${text}%20${url}`,
    },
  ] as const;
}

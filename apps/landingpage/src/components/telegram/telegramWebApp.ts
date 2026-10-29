/**
 * The slice of Telegram's Mini App bridge (telegram-web-app.js) this page uses.
 * https://core.telegram.org/bots/webapps#initializing-mini-apps
 */
export type TelegramWebApp = {
  initData: string;
  version: string;
  colorScheme: "light" | "dark";
  themeParams: { bg_color?: string; text_color?: string; button_color?: string };
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  shareToStory?(
    mediaUrl: string,
    params?: { text?: string; widget_link?: { url: string; name?: string } }
  ): void;
  shareMessage?(id: string, callback?: (sent: boolean) => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  MainButton: {
    setParams(params: {
      text?: string;
      is_visible?: boolean;
      is_active?: boolean;
      color?: string;
      text_color?: string;
    }): void;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: { notificationOccurred(type: "error" | "success" | "warning"): void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const TELEGRAM_WEB_APP_SCRIPT = "https://telegram.org/js/telegram-web-app.js";

/** The bridge when this page runs inside Telegram with launch data, otherwise null. */
export function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const app = window.Telegram?.WebApp;
  return app && app.initData ? app : null;
}

/** A solid #rrggbb for Telegram's header, or null for gradients, images and named colors. */
export function solidHex(value: string | null | undefined): string | null {
  return value && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
}

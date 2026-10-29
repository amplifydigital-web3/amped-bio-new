"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Share2, UserPlus, Users } from "lucide-react";
import { TELEGRAM_MINIAPP_STRINGS as S, type ThemeConfig } from "@repo/constants";
import { cn } from "@repo/ui";
import { TextBlock } from "@/components/blocks/text/TextBlock";
import { MediaBlock } from "@/components/blocks/MediaBlock";
import { CREATOR_FOCUS, CreatorButton } from "@/components/blocks/frame";
import { getPlatformIcon } from "@/lib/platforms";
import { trpcClient } from "@/lib/trpc";
import {
  TELEGRAM_WEB_APP_SCRIPT,
  solidHex,
  telegramWebApp,
  type TelegramWebApp,
} from "./telegramWebApp";

type Page = Awaited<ReturnType<typeof trpcClient.telegram.miniapp.page.query>>;
type Block = Page["blocks"][number];

const LANDING = (process.env.NEXT_PUBLIC_LANDINGPAGE_URL ?? "https://amped.bio").replace(
  /\/+$/,
  ""
);

/** The theme's ground: its color or gradient, its image, or Telegram's own background. */
function groundStyle(theme: ThemeConfig | null): React.CSSProperties {
  const bg = theme?.background;
  if (bg?.type === "color" && bg.value) return { background: bg.value };
  if (bg?.type === "image" && bg.value) {
    return {
      backgroundImage: `url("${bg.value}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: "var(--tg-theme-bg-color, #ffffff)" };
}

function errorCode(error: unknown): string | null {
  const data = (error as { data?: { code?: string } } | null)?.data;
  return data?.code ?? null;
}

/**
 * The Mini App page (board tg7). The creator's page as the server built it under the
 * TON allow list, in the creator's theme. The MainButton messages the creator when
 * Fan messages is open; a viewer who has not linked Telegram gets the Link sheet. The
 * 44 px Share icon posts a story with the direct link, or the prepared card, or a
 * t.me/share link on older clients. Made with Amped.Bio is plain text when anything
 * was left out, so the Mini App never links to a page with things it would not show.
 */
export function MiniApp() {
  const [app, setApp] = useState<TelegramWebApp | null>(null);
  const [outside, setOutside] = useState(false);
  const [linkSheet, setLinkSheet] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  const attach = useCallback(() => {
    const found = telegramWebApp();
    if (found) {
      found.ready();
      found.expand();
      setApp(found);
    } else {
      setOutside(true);
    }
  }, []);

  // The script may already be loaded on a client side navigation
  useEffect(() => {
    if (window.Telegram?.WebApp) attach();
  }, [attach]);

  const initData = app?.initData ?? "";
  const page = useQuery({
    queryKey: ["telegram-miniapp-page", initData],
    queryFn: () => trpcClient.telegram.miniapp.page.query({ initData }),
    enabled: !!initData,
    retry: false,
    staleTime: Infinity,
  });
  const data = page.data;

  const [following, setFollowing] = useState(false);
  useEffect(() => {
    if (data) setFollowing(data.viewer.following);
  }, [data]);

  const follow = useMutation({
    mutationFn: () => trpcClient.telegram.miniapp.follow.mutate({ initData }),
    onSuccess: () => {
      setFollowing(true);
      app?.HapticFeedback?.notificationOccurred("success");
      if (data) setLine(S.followed(data.creator.name));
    },
    onError: error => {
      if (errorCode(error) === "PRECONDITION_FAILED") setLinkSheet(true);
      else setLine(S.followFailed);
    },
  });

  // The theme colors Telegram's header and ground when it is a solid color
  const theme = (data?.theme ?? null) as ThemeConfig | null;
  useEffect(() => {
    if (!app || !data) return;
    const solid = theme?.background?.type === "color" ? solidHex(theme.background.value) : null;
    if (solid && app.isVersionAtLeast("6.1")) {
      app.setHeaderColor(solid);
      app.setBackgroundColor(solid);
    }
  }, [app, data, theme]);

  // BackButton closes the Mini App: the page has no screens behind it
  useEffect(() => {
    if (!app || !app.isVersionAtLeast("6.1")) return;
    const back = () => (linkSheet ? setLinkSheet(false) : app.close());
    app.BackButton.show();
    app.BackButton.onClick(back);
    return () => app.BackButton.offClick(back);
  }, [app, linkSheet]);

  // MainButton: Message {creator} on Telegram, only while Fan messages is open
  const messageLink = data?.messageLink ?? null;
  const linked = !!data?.viewer.linked;
  const onMain = useCallback(() => {
    if (!app || !messageLink) return;
    if (!linked) setLinkSheet(true);
    else app.openTelegramLink(messageLink);
  }, [app, messageLink, linked]);
  useEffect(() => {
    if (!app || !data) return;
    if (!messageLink || linkSheet) {
      app.MainButton.hide();
      return;
    }
    app.MainButton.setParams({
      text: S.messageMain(data.creator.name),
      is_visible: true,
      is_active: true,
    });
    app.MainButton.onClick(onMain);
    return () => app.MainButton.offClick(onMain);
  }, [app, data, messageLink, linkSheet, onMain]);

  const sharing = useRef(false);
  const onShare = async () => {
    if (!app || !data?.shareLink || sharing.current) return;
    sharing.current = true;
    try {
      if (data.creator.image && app.shareToStory && app.isVersionAtLeast("7.8")) {
        app.shareToStory(data.creator.image, {
          text: S.shareText(data.creator.name),
          widget_link: { url: data.shareLink, name: data.creator.name },
        });
        return;
      }
      if (app.shareMessage && app.isVersionAtLeast("8.0")) {
        try {
          const prepared = await trpcClient.telegram.miniapp.prepareShare.mutate({ initData });
          app.shareMessage(prepared.id);
          return;
        } catch {
          // Fall through to a plain share link
        }
      }
      const url = `https://t.me/share/url?url=${encodeURIComponent(data.shareLink)}&text=${encodeURIComponent(S.shareText(data.creator.name))}`;
      app.openTelegramLink(url);
    } finally {
      sharing.current = false;
    }
  };

  const script = (
    <Script src={TELEGRAM_WEB_APP_SCRIPT} strategy="afterInteractive" onReady={attach} />
  );

  if (outside)
    return (
      <Notice>
        {S.outsideTelegram}
        {script}
      </Notice>
    );
  if (page.isError) {
    const code = errorCode(page.error);
    return (
      <Notice>
        {code === "NOT_FOUND" ? S.notFound : S.failed}
        {script}
      </Notice>
    );
  }
  if (!data) return <Loading>{script}</Loading>;

  const textStyle = { color: theme?.fontColor, fontFamily: theme?.fontFamily };
  const themeForBlocks = (theme ?? {}) as ThemeConfig;

  return (
    <main className="min-h-dvh" style={groundStyle(theme)}>
      {script}
      <div
        className="mx-auto flex max-w-[560px] flex-col items-center gap-[13px] pb-[89px] pt-[21px]"
        style={{
          paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="flex w-full justify-end">
          {data.shareLink && (
            <button
              type="button"
              onClick={() => void onShare()}
              aria-label={S.share}
              className={cn(
                "flex h-[44px] w-[44px] items-center justify-center rounded-full",
                CREATOR_FOCUS
              )}
              style={textStyle}
            >
              <Share2 aria-hidden className="h-[21px] w-[21px]" />
            </button>
          )}
        </div>
        {data.creator.image && (
          <img
            src={data.creator.image}
            alt=""
            className="h-[89px] w-[89px] rounded-full object-cover"
          />
        )}
        <h1 className="text-center text-[26px] font-semibold leading-[34px]" style={textStyle}>
          {data.creator.name}
        </h1>
        {data.creator.bio && (
          <div
            className="max-w-[65ch] text-center text-[16px] leading-[26px]"
            style={textStyle}
            // Sanitized on the server (sanitizeRichText)
            dangerouslySetInnerHTML={{ __html: data.creator.bio }}
          />
        )}
        <div className="mt-[8px] flex w-full flex-col gap-[13px]">
          {data.blocks.map(block => (
            <MiniAppBlock
              key={block.id}
              block={block}
              theme={themeForBlocks}
              creatorName={data.creator.name}
              following={following}
              followPending={follow.isPending}
              onFollow={() => (linked ? follow.mutate() : setLinkSheet(true))}
              open={url => app?.openLink(url)}
              openTelegram={url => app?.openTelegramLink(url)}
              textStyle={textStyle}
            />
          ))}
        </div>
        {line && (
          <p role="status" className="text-center text-[13px] leading-4" style={textStyle}>
            {line}
          </p>
        )}
        <footer className="mt-[21px] text-[13px] leading-[16px]" style={textStyle}>
          {data.skipped ? (
            <span>{S.madeWith}</span>
          ) : (
            <button
              type="button"
              onClick={() => app?.openLink(`${LANDING}/${encodeURIComponent(data.creator.handle)}`)}
              className={cn("min-h-[44px] px-1 underline-offset-2 hover:underline", CREATOR_FOCUS)}
            >
              {S.madeWith}
            </button>
          )}
        </footer>
      </div>
      {linkSheet && (
        <LinkSheet
          onLink={() => app?.openLink(`${LANDING}/${encodeURIComponent(data.creator.handle)}`)}
          onClose={() => setLinkSheet(false)}
        />
      )}
    </main>
  );
}

function MiniAppBlock({
  block,
  theme,
  creatorName,
  following,
  followPending,
  onFollow,
  open,
  openTelegram,
  textStyle,
}: {
  block: Block;
  theme: ThemeConfig;
  creatorName: string;
  following: boolean;
  followPending: boolean;
  onFollow: () => void;
  open: (url: string) => void;
  openTelegram: (url: string) => void;
  textStyle: React.CSSProperties;
}) {
  switch (block.kind) {
    case "text":
      return (
        <TextBlock
          block={{ id: block.id, type: "text", order: 0, config: block.config } as never}
          theme={theme}
        />
      );
    case "media":
      return (
        <MediaBlock
          block={{ id: block.id, type: "media", order: 0, config: block.config } as never}
          theme={theme}
        />
      );
    case "link": {
      const config = block.config as { platform: string; url: string; label: string };
      const Icon = getPlatformIcon(config.platform);
      const url = config.url.startsWith("http") ? config.url : `https://${config.url}`;
      return (
        <CreatorButton
          theme={theme}
          icon={<Icon className="h-[21px] w-[21px]" />}
          label={config.label}
          onClick={() => open(url)}
        />
      );
    }
    case "follow":
      return (
        <CreatorButton
          theme={theme}
          icon={<UserPlus className="h-[21px] w-[21px]" />}
          label={following ? S.following : S.follow}
          onClick={following || followPending ? undefined : onFollow}
        />
      );
    case "followers":
      return (
        <p className="text-center text-[13px] leading-4 opacity-80" style={textStyle}>
          {S.followersLine(block.count)}
        </p>
      );
    case "join_group":
      return (
        <div className="space-y-1.5">
          <CreatorButton
            theme={theme}
            icon={<Users className="h-[21px] w-[21px]" />}
            label={S.joinGroup(creatorName)}
            onClick={() => openTelegram(block.link)}
          />
          {block.rule && (
            <p className="text-center text-[13px] leading-4 opacity-80" style={textStyle}>
              {block.rule}
            </p>
          )}
        </div>
      );
    default:
      return null;
  }
}

/** Board tg7, Link sheet: one action, Link Telegram on the site, or Not now. */
function LinkSheet({ onLink, onClose }: { onLink: () => void; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tg-link-title"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        className="w-full rounded-t-[21px] p-[21px] outline-none"
        style={{
          background: "var(--tg-theme-bg-color, #ffffff)",
          color: "var(--tg-theme-text-color, #111111)",
          paddingBottom: "max(21px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <h2 id="tg-link-title" className="text-[18px] font-semibold leading-[26px]">
          {S.linkTitle}
        </h2>
        <p className="mt-[8px] text-[15px] leading-[21px] opacity-80">{S.linkBody}</p>
        <button
          type="button"
          onClick={onLink}
          className="mt-[21px] min-h-[48px] w-full rounded-[13px] text-[16px] font-semibold"
          style={{
            background: "var(--tg-theme-button-color, #2481cc)",
            color: "var(--tg-theme-button-text-color, #ffffff)",
          }}
        >
          {S.linkButton}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-[8px] min-h-[44px] w-full text-[15px]"
          style={{ color: "var(--tg-theme-link-color, #2481cc)" }}
        >
          {S.notNow}
        </button>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 text-center text-[16px] leading-[26px]"
      style={{
        background: "var(--tg-theme-bg-color, #ffffff)",
        color: "var(--tg-theme-text-color, #111111)",
      }}
    >
      <p>{children}</p>
    </main>
  );
}

function Loading({ children }: { children: React.ReactNode }) {
  return (
    <main
      aria-busy="true"
      className="min-h-dvh"
      style={{ background: "var(--tg-theme-bg-color, #ffffff)" }}
    >
      {children}
    </main>
  );
}

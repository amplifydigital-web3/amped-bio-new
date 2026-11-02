import { ParticlesBackground } from "./particles/ParticlesBackground";
import { cn } from "../utils/cn";
import {
  getButtonBaseStyle,
  getContainerStyle,
  getButtonEffectStyle,
  getHeroEffectStyle,
} from "../utils/styles";
import { getPlatformIcon } from "../utils/platforms";
import { MediaBlock } from "./blocks/MediaBlock";
import { TextBlock } from "./blocks/text/TextBlock";
import { CreatorPoolBlock } from "./blocks/CreatorPoolBlock";
import { ReferralBlock } from "./blocks/ReferralBlock";
import { FollowBlock } from "./blocks/FollowBlock";
import { FollowersBlock } from "./blocks/FollowersBlock";
import { RnsIdBlock } from "./blocks/RnsIdBlock";
import { TelegramMessagePreview } from "./blocks/TelegramMessageBlock";
import { isHTML } from "@/utils/htmlutils";
import { type BlockType, DEFAULT_RNSID_CONFIG, safeHref, sanitizeRichHtml } from "@repo/constants";
import { Theme, UserProfile } from "@/types/editor";
import { trpcClient } from "@repo/ui";
import {
  CreatorButton,
  CreatorPage,
  RnsIdentityChip,
  RnsVerifiedMark,
  THEME_DEFAULTS,
  creatorTextStyle,
  headerRnsIdentity,
  themeCssVars,
  type CreatorPageSize,
} from "@repo/ui";
import { type ReactNode } from "react";
import { useReferralHandler } from "@/hooks/useReferralHandler";
import { ErrorBoundary } from "./ErrorBoundary";
import { usePreviewMotion } from "./preview/PreviewChrome";
import { AlertCircle } from "lucide-react";
import { blockNeed, isHidden, mediaName } from "./panels/page/blocks/blockInfo";
import { useMyPageIdentity, withLiveAttributes } from "./panels/page/rns/useMyPageIdentity";

// Helper function to extract the root domain from a URL
const extractRootDomain = (url: string): string => {
  try {
    // Add protocol if missing to make URL constructor work
    const urlString = url.startsWith("http") ? url : `https://${url}`;
    const urlObj = new URL(urlString);
    return urlObj.hostname;
  } catch {
    // Return the original URL if parsing fails
    return url;
  }
};

/** QA-004: shows behind a video background until its first frame arrives
 *  (same value as the public page). */
const VIDEO_BACKDROP = "#14141C";

const fanGraphOn = import.meta.env.VITE_FAN_GRAPH === "true";
const rnsOn = import.meta.env.VITE_SHOW_RNS === "true";
const telegramOn = import.meta.env.VITE_SHOW_TELEGRAM === "true";
// Theme Engine v2 (#28): the preview mounts the shared CreatorPage shell, so it
// draws what the public page draws (spec 3.4, closes D10)
const themeV2On = import.meta.env.VITE_SHOW_THEME_V2 === "true";

interface PreviewProps {
  isEditing: boolean;
  profile: UserProfile;
  blocks: BlockType[];
  theme: Theme;
  userId?: number;
  /** Editor preview: a click on a block opens it in the Page list (D10, 036 I13) */
  onBlockSelect?: (id: number) => void;
  /**
   * The device the preview renders for (SHOW_THEME_V2). The preview sits in a
   * scaled device frame, so viewport breakpoints cannot pick the sizes.
   */
  layout?: Exclude<CreatorPageSize, "responsive">;
}

/** 040 I06: the 21 platform icon, or the site favicon for custom links, as on the public page. */
function LinkIcon({ platform, url }: { platform: string; url: string }) {
  if (platform === "custom") {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${extractRootDomain(url)}&sz=64`}
        className="h-[21px] w-[21px] rounded-[5px]"
        alt=""
      />
    );
  }
  const Icon = getPlatformIcon(platform);
  return <Icon className="h-[21px] w-[21px]" />;
}

/**
 * Editor only: the Fix chip on a block that cannot render (Screen Review 006
 * I08). Prism chrome on G1 clear; the public page renders nothing instead.
 */
function FixChip({ block, onFix }: { block: BlockType; onFix?: () => void }) {
  const what =
    block.type === "media"
      ? `a valid ${mediaName(block.config.platform)} link`
      : block.type === "pool"
        ? "a pool"
        : block.type === "text"
          ? "some text"
          : "a link";
  return (
    <div className="prism-glass-clear flex items-center gap-2 !rounded-prism-13 px-3 py-2 font-prism text-[16px] leading-6 text-prism-ink">
      <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-danger" />
      <span className="flex-1">This block needs {what}</span>
      {onFix && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onFix();
          }}
          className="prism-btn-ghost prism-focus h-touch rounded-prism-13 px-3 text-prism-label font-semibold"
        >
          Fix
        </button>
      )}
    </div>
  );
}

export function Preview({
  isEditing,
  profile,
  blocks,
  theme,
  userId,
  onBlockSelect,
  layout = "phone",
}: PreviewProps) {
  const themeConfig = theme.config;
  const { handleReferrerClick } = useReferralHandler();
  const previewMotion = usePreviewMotion();

  // 108 I11, 109 I14: the chip exactly as the public page renders it, from
  // the same server rule (rns.getMyPageIdentity), with the sheet read only
  const pageIdentity = useMyPageIdentity(isEditing);
  const rnsIdBlock = blocks.find(block => block.type === "rnsid" && !isHidden(block));
  const identity = withLiveAttributes(
    pageIdentity.data,
    rnsIdBlock?.type === "rnsid"
      ? { ...DEFAULT_RNSID_CONFIG.show, ...rnsIdBlock.config.show }
      : null
  );
  // 112 D9: the header keeps to a linked name, as on the public page
  const headerIdentity = headerRnsIdentity(identity);

  const handleLinkClick = (block: BlockType) => {
    // The editor preview is the creator looking at their own page. Those clicks
    // are not visitor clicks and must never reach the click counter.
    if (isEditing) return;
    if (block.type === "link") {
      trpcClient.blocks.registerClick.mutate({ id: block.id });
    }
  };

  // One block as visitors see it. `fallback` shows when the block throws.
  const renderBlock = (block: BlockType, fallback: ReactNode) => {
    if (block.type === "link" && themeV2On) {
      return (
        <ErrorBoundary key={block.id.toString()} fallback={fallback}>
          <CreatorButton
            theme={themeConfig}
            icon={<LinkIcon platform={block.config.platform} url={block.config.url} />}
            label={block.config.label}
            href={block.config.url}
            onClick={() => handleLinkClick(block)}
          />
        </ErrorBoundary>
      );
    }
    if (block.type === "link") {
      const Icon = getPlatformIcon(block.config.platform);
      const element =
        block.config.platform === "custom" ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${extractRootDomain(block.config.url)}&sz=128`}
            className="w-5 h-5 flex-shrink-0 rounded-full"
          />
        ) : (
          <Icon className="w-5 h-5 flex-shrink-0" />
        );

      return (
        <ErrorBoundary key={block.id.toString()} fallback={fallback}>
          <a
            // D57: an unsafe stored link renders with no href, so a click in the
            // editor never runs script in the app with the creator signed in
            href={safeHref(block.config.url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleLinkClick(block)}
            className={cn(
              "w-full px-4 py-3 flex items-center space-x-3",
              "transition-all duration-200",
              getButtonBaseStyle(themeConfig?.buttonStyle),
              getButtonEffectStyle(themeConfig?.buttonEffect)
            )}
            style={{
              backgroundColor: themeConfig?.buttonColor,
              fontFamily: themeConfig?.fontFamily,
              fontSize: themeConfig?.fontSize,
              color: themeConfig?.fontColor,
            }}
          >
            {element}
            <span className="flex-1 text-center">{block.config.label}</span>
          </a>
        </ErrorBoundary>
      );
    }
    if (block.type === "media") {
      return (
        <ErrorBoundary key={block.id} fallback={fallback}>
          <MediaBlock block={block} theme={themeConfig} />
        </ErrorBoundary>
      );
    }
    if (block.type === "pool") {
      return (
        <ErrorBoundary key={block.id} fallback={fallback}>
          <CreatorPoolBlock block={block} theme={themeConfig} />
        </ErrorBoundary>
      );
    }
    if (block.type === "referral") {
      return (
        <ErrorBoundary key={block.id} fallback={fallback}>
          <ReferralBlock
            block={block}
            theme={themeConfig}
            pageOwnerId={userId ?? 0}
            isPreview={isEditing}
          />
        </ErrorBoundary>
      );
    }
    // Follow blocks (#30) show only while the fan graph is on, as on the page
    if (block.type === "follow") {
      if (!fanGraphOn) return null;
      return (
        <ErrorBoundary key={block.id} fallback={fallback}>
          <FollowBlock block={block} theme={themeConfig} />
        </ErrorBoundary>
      );
    }
    if (block.type === "followers") {
      if (!fanGraphOn) return null;
      return (
        <ErrorBoundary key={block.id} fallback={fallback}>
          <FollowersBlock block={block} theme={themeConfig} handle={profile.handle ?? ""} />
        </ErrorBoundary>
      );
    }
    // RNS ID block (#33) shows only while RNS is on, as on the page
    if (block.type === "rnsid") {
      if (!rnsOn) return null;
      return (
        <ErrorBoundary key={block.id} fallback={fallback}>
          <RnsIdBlock
            block={block}
            theme={themeConfig}
            displayName={profile.name}
            avatarUrl={profile.photoUrl || null}
          />
        </ErrorBoundary>
      );
    }
    // Messaging on Telegram (#2, row 115). The group block waits on PR 5.
    if (block.type === "telegram_message") {
      if (!telegramOn) return null;
      return (
        <ErrorBoundary key={block.id} fallback={fallback}>
          <TelegramMessagePreview block={block} theme={themeConfig} />
        </ErrorBoundary>
      );
    }
    if (block.type === "telegram_group") return null;
    return (
      <ErrorBoundary key={block.id} fallback={fallback}>
        <TextBlock block={block} theme={themeConfig} />
      </ErrorBoundary>
    );
  };

  // One entry per visible block: Fix chips for blocks that cannot render, and
  // click capture so preview clicks select instead of navigating (006 I05)
  const blockList = blocks.map(block => {
    // Hidden blocks render in neither the preview nor the page (036 I09)
    if (isHidden(block)) return null;
    const select = onBlockSelect ? () => onBlockSelect(block.id) : undefined;
    if (blockNeed(block) !== null) {
      return isEditing ? <FixChip key={block.id} block={block} onFix={select} /> : null;
    }
    const fallback = isEditing ? <FixChip block={block} onFix={select} /> : null;
    const inner = renderBlock(block, fallback);
    if (!isEditing) return inner;
    return (
      <div
        key={block.id}
        onClickCapture={event => {
          // Preview clicks never navigate or count (006 I05)
          event.preventDefault();
          event.stopPropagation();
          select?.();
        }}
        className={cn(select && "cursor-pointer")}
      >
        {inner}
      </div>
    );
  });

  if (themeV2On) {
    const shown = blockList.filter(Boolean);
    return (
      <CreatorPage
        theme={themeConfig}
        mode={isEditing ? "edit" : "preview"}
        size={layout}
        // Editor chrome: Device budget and Pause motion for the preview only
        device={previewMotion.device}
        paused={previewMotion.paused}
        profile={{
          name: profile.name,
          photo: profile.photoCmp || profile.photoUrl,
          bio: profile.bio,
        }}
        nameExtras={
          headerIdentity?.chip === "verified" && <RnsVerifiedMark className="ml-2 align-[-3px]" />
        }
        identity={
          headerIdentity && (
            <RnsIdentityChip
              identity={headerIdentity}
              displayName={profile.name}
              avatarUrl={profile.photoUrl || null}
              fontFamily={themeConfig?.fontFamily}
              fontColor={themeConfig?.fontColor}
              rnsUrl={import.meta.env.VITE_RNS_URL}
              readOnly
            />
          )
        }
        blocks={shown.length > 0 ? shown : null}
        footer={
          <footer
            className="mt-[34px] flex flex-col items-center"
            style={creatorTextStyle(themeConfig)}
          >
            <button
              type="button"
              onClick={() => {
                // In the editor this would overwrite the creator's referral
                // cookie and navigate the editor away to /register
                if (profile.id && !isEditing) handleReferrerClick(profile.id);
              }}
              className={cn(
                "min-h-[44px] px-1 text-[13px] leading-[16px] underline-offset-2",
                !isEditing && "hover:underline"
              )}
            >
              Made with Amped.Bio
            </button>
          </footer>
        }
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col",
        isEditing ? "h-full" : "h-screen",
        themeConfig?.background?.type === "color" &&
          !themeConfig?.background?.value?.includes("gradient")
          ? "bg-gray-100"
          : ""
      )}
      style={themeCssVars(themeConfig)}
    >
      {/* Background layer: fixed to the viewport on a page; in the editor it
          stays put outside the scroller, so it fills the device while the page
          scrolls inside (QA-024) */}
      <div
        className={cn(isEditing ? "absolute" : "fixed", "inset-0 w-full h-full z-[1]")}
        // QA-004: set only the background shorthand. Pairing it with
        // backgroundColor makes React write background="" on render, which
        // clears the color and the video backdrop.
        style={{
          background:
            themeConfig?.background?.type === "color"
              ? themeConfig.background.value || undefined
              : themeConfig?.background?.type === "video"
                ? VIDEO_BACKDROP
                : undefined,
        }}
      >
        {themeConfig?.background?.type === "video" ? (
          <video
            src={themeConfig.background.value || ""}
            poster={themeConfig.background.thumbnail || undefined}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : themeConfig?.background?.type === "image" ? (
          <div
            className="w-full h-full bg-no-repeat bg-center"
            style={{
              backgroundImage: `url(${themeConfig.background.value})`,
              backgroundSize: "cover",
            }}
          />
        ) : null}
        <div className="absolute inset-0">
          <ParticlesBackground
            effect={themeConfig?.particlesEffect ?? THEME_DEFAULTS.particlesEffect}
          />
        </div>
      </div>

      <div className="relative z-[2] flex-1 overflow-auto">
        {/* Content Layer */}
        <div className="min-h-full relative z-[2]">
          <div
            className={cn(
              "relative min-h-full py-8 px-4 transition-all duration-300 mx-auto z-10 max-w-[640px]"
            )}
          >
            {/* Container */}
            <div
              className={cn("w-full space-y-8 p-8", getContainerStyle(themeConfig?.containerStyle))}
              style={{
                backgroundColor: `${themeConfig?.containerColor}${Math.round(
                  (themeConfig?.transparency ?? THEME_DEFAULTS.transparency) * 2.55
                )
                  .toString(16)
                  .padStart(2, "0")}`,
              }}
            >
              {/* Profile Section */}

              <div className="flex flex-col items-center text-center space-y-6">
                {profile.photoUrl && (
                  <div className="relative">
                    <img
                      src={profile.photoUrl}
                      alt={profile.name}
                      className="w-32 h-32 rounded-full object-cover ring-4 ring-white/50 shadow-xl"
                    />
                    <div className="absolute -inset-1 rounded-full" />
                  </div>
                )}
                {profile.photoCmp && (
                  <div className="relative">
                    <img src={profile.photoCmp} alt={profile.name} className="w-32 h-auto" />
                  </div>
                )}
                <div className="space-y-4 w-full">
                  <div className="w-full">
                    <h1
                      className={cn(
                        "text-4xl font-bold tracking-tight",
                        getHeroEffectStyle(themeConfig?.heroEffect)
                      )}
                      style={{
                        fontFamily: themeConfig?.fontFamily,
                        color: themeConfig?.fontColor,
                      }}
                    >
                      {profile.name}
                      {headerIdentity?.chip === "verified" && (
                        <RnsVerifiedMark className="ml-2 align-[-3px]" />
                      )}
                    </h1>
                    {headerIdentity && (
                      <div className="mt-2 flex justify-center">
                        <RnsIdentityChip
                          identity={headerIdentity}
                          displayName={profile.name}
                          avatarUrl={profile.photoUrl || null}
                          fontFamily={themeConfig?.fontFamily}
                          fontColor={themeConfig?.fontColor}
                          rnsUrl={import.meta.env.VITE_RNS_URL}
                          readOnly
                        />
                      </div>
                    )}
                  </div>
                  {profile.bio &&
                    (isHTML(profile.bio) ? (
                      <p
                        className="text-lg max-w-2xl mx-auto leading-relaxed"
                        style={{
                          fontFamily: themeConfig?.fontFamily,
                          color: themeConfig?.fontColor,
                          opacity: 0.9,
                        }}
                        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(profile.bio) }}
                      />
                    ) : (
                      <p
                        className="text-lg max-w-2xl mx-auto leading-relaxed"
                        style={{
                          fontFamily: themeConfig?.fontFamily,
                          color: themeConfig?.fontColor,
                          opacity: 0.9,
                        }}
                      >
                        {profile.bio}
                      </p>
                    ))}
                </div>
              </div>

              {/* Links & Blocks */}
              <div className="space-y-4">{blockList}</div>

              {/* Powered by footer */}
              <div className="pt-4 text-center">
                <button
                  onClick={() => {
                    // In the editor this would overwrite the creator's referral
                    // cookie and navigate the editor away to /register
                    if (profile.id && !isEditing) {
                      handleReferrerClick(profile.id);
                    }
                  }}
                  className={cn(
                    "text-[13px] leading-4 opacity-70 transition-opacity",
                    !isEditing && "cursor-pointer hover:opacity-100"
                  )}
                  style={{
                    fontFamily: themeConfig?.fontFamily,
                    color: themeConfig?.fontColor,
                    border: "none",
                    outline: "none",
                    background: "none",
                    padding: 0,
                  }}
                >
                  Made with Amped.Bio
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

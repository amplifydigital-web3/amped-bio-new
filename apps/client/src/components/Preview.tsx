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
import { isHTML } from "@/utils/htmlutils";
import { type BlockType, sanitizeRichHtml } from "@repo/constants";
import { Theme, UserProfile } from "@/types/editor";
import { trpcClient } from "@repo/ui";
import { RnsIdentityChip, RnsVerifiedMark, THEME_DEFAULTS, themeCssVars } from "@repo/ui";
import { type ReactNode } from "react";
import { useReferralHandler } from "@/hooks/useReferralHandler";
import { ErrorBoundary } from "./ErrorBoundary";
import { AlertCircle } from "lucide-react";
import { blockNeed, isHidden, mediaName } from "./panels/page/blocks/blockInfo";
import { useMyPageIdentity } from "./panels/page/rns/useMyPageIdentity";

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

interface PreviewProps {
  isEditing: boolean;
  profile: UserProfile;
  blocks: BlockType[];
  theme: Theme;
  userId?: number;
  /** Editor preview: a click on a block opens it in the Page list (D10, 036 I13) */
  onBlockSelect?: (id: number) => void;
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
}: PreviewProps) {
  const themeConfig = theme.config;
  const { handleReferrerClick } = useReferralHandler();

  // 108 I11, 109 I14: the chip exactly as the public page renders it, from
  // the same server rule (rns.getMyPageIdentity), with the sheet read only
  const pageIdentity = useMyPageIdentity(isEditing);
  const identity = pageIdentity.data?.identity ?? null;

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
            href={block.config.url}
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
    return (
      <ErrorBoundary key={block.id} fallback={fallback}>
        <TextBlock block={block} theme={themeConfig} />
      </ErrorBoundary>
    );
  };

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
        style={{
          backgroundColor:
            themeConfig?.background?.type === "color" &&
            !themeConfig?.background?.value?.includes("gradient")
              ? themeConfig?.background?.value || undefined
              : themeConfig?.background?.type === "video"
                ? VIDEO_BACKDROP
                : undefined,
          background:
            themeConfig?.background?.type === "color" &&
            themeConfig?.background?.value?.includes("gradient")
              ? themeConfig?.background?.value || undefined
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
                      {identity?.chip === "verified" && (
                        <RnsVerifiedMark className="ml-2 align-[-3px]" />
                      )}
                    </h1>
                    {identity && (
                      <div className="mt-2 flex justify-center">
                        <RnsIdentityChip
                          identity={identity}
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
              <div className="space-y-4">
                {blocks.map(block => {
                  // Hidden blocks render in neither the preview nor the page (036 I09)
                  if (isHidden(block)) return null;
                  const select = onBlockSelect ? () => onBlockSelect(block.id) : undefined;
                  if (blockNeed(block) !== null) {
                    return isEditing ? (
                      <FixChip key={block.id} block={block} onFix={select} />
                    ) : null;
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
                })}
              </div>

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

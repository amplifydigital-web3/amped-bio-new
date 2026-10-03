"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Pause, Pencil, Play } from "lucide-react";
import { getPlatformIcon } from "@/lib/platforms";
import { trpcClient } from "@/lib/trpc";
import { normalizeHandle } from "@/lib/handle";
import { Button, Skeleton, cn, THEME_DEFAULTS, themeCssVars } from "@repo/ui";
import { ParticlesBackground } from "@/components/ParticlesBackground";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TextBlock } from "@/components/blocks/text/TextBlock";
import { MediaBlock } from "@/components/blocks/MediaBlock";
import { CreatorPoolBlock } from "@/components/blocks/CreatorPoolBlock";
import { ReferralBlock } from "@/components/blocks/ReferralBlock";
import { useReferralHandler } from "@/hooks/useReferralHandler";
import { useAuth } from "@/contexts/AuthContext";
import {
  recordConsent,
  startEngagementTracking,
  trackConsentedPageView,
  trackLinkClick,
  trackProfileView,
} from "@/lib/analytics";
import {
  firePixelLinkClick,
  firePixelPageView,
  hasAnyPixel,
  loadPixels,
  pixelServiceNames,
} from "@/lib/adPixels";
import {
  getAdsConsent,
  getAnalyticsConsent,
  hasGlobalPrivacyControl,
  saveConsent,
} from "@/lib/consent";
import { TrackingConsentBanner, type ConsentChoice } from "@/components/TrackingConsentBanner";
import { getContainerStyle, getHeroEffectStyle, isHTML, LOOPING_HERO_EFFECTS } from "@/lib/styles";
import { CREATOR_FOCUS, CreatorButton } from "@/components/blocks/frame";
import { useFollow } from "@/components/follow/useFollow";
import {
  FirstFollowSheet,
  FollowButton,
  FollowerCount,
  FollowToastView,
} from "@/components/follow/FollowControls";
import { isRenderable, sanitizeRichHtml, type BlockType } from "@repo/constants";
import {
  DEFAULT_HANDLE,
  DEFAULT_PROFILE_DATA,
  mapGetHandleData,
  type ProfilePageData,
  type Theme,
  type UserProfile,
} from "@/lib/profilePageData";

function extractRootDomain(url: string): string {
  try {
    const urlString = url.startsWith("http") ? url : `https://${url}`;
    return new URL(urlString).hostname;
  } catch {
    return url;
  }
}

/** 040 I06: the 21 platform icon, or the site favicon (r5) for custom links. */
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

// Screen Review 039 I11: the skeleton matches the final layout and shows only
// after 400ms; static under reduced motion.
function ProfileSkeleton() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 400);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="min-h-dvh bg-[#F4F3FA]" aria-busy aria-label="Loading page">
      {shown && (
        <div className="mx-auto flex max-w-[610px] flex-col items-center px-[21px] pb-[89px] pt-[34px] sm:pt-[55px]">
          <Skeleton className="h-[89px] w-[89px] rounded-full motion-reduce:animate-none sm:h-[144px] sm:w-[144px]" />
          <Skeleton className="mt-[21px] h-[26px] w-48 rounded-full motion-reduce:animate-none" />
          <Skeleton className="mt-[13px] h-4 w-64 rounded-full motion-reduce:animate-none" />
          <Skeleton className="mt-2 h-4 w-56 rounded-full motion-reduce:animate-none" />
          <div className="mt-[34px] w-full space-y-[13px]">
            {[0, 1, 2].map(index => (
              <Skeleton
                key={index}
                className="h-[55px] w-full rounded-prism-13 motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PAUSE_KEY = "amped.motion.paused";

/** Pause motion, remembered per visitor (041 I02). Storage may be unavailable. */
function readPaused() {
  try {
    return window.localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writePaused(value: boolean) {
  try {
    if (value) window.localStorage.setItem(PAUSE_KEY, "1");
    else window.localStorage.removeItem(PAUSE_KEY);
  } catch {
    // The choice still applies for this visit
  }
}

/** 039 I03: the frame capsule hides while scrolling down and returns on scroll up. */
function useScrollingDown() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setDown(y > last && y > 89);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return down;
}

export function ProfileView({
  handle: rawHandle,
  initialData,
}: {
  handle?: string;
  initialData?: ProfilePageData | null;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(initialData?.profile ?? null);
  const [blocks, setBlocks] = useState<BlockType[]>(initialData?.blocks ?? []);
  const [theme, setTheme] = useState<Theme | null>(initialData?.theme ?? null);
  const [hasCreatorPool, setHasCreatorPool] = useState(initialData?.hasCreatorPool ?? false);
  const [creatorPoolAddress, setCreatorPoolAddress] = useState(
    initialData?.creatorPoolAddress ?? null
  );
  const [paused, setPaused] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const scrollingDown = useScrollingDown();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardObserver = useRef<ResizeObserver | null>(null);
  const [trackingPixels, setTrackingPixels] = useState(initialData?.trackingPixels ?? null);
  // null until read on the client; each value is null until the visitor chooses
  const [consent, setConsent] = useState<{
    analytics: boolean | null;
    ads: boolean | null;
  } | null>(null);
  const [bannerMode, setBannerMode] = useState<"hidden" | "prompt" | "settings">("hidden");
  const [loading, setLoading] = useState(!initialData);
  const [copied, setCopied] = useState(false);

  const { authUser, isPending: authPending } = useAuth();
  const { handleReferrerClick } = useReferralHandler();

  const effectiveHandle = rawHandle || DEFAULT_HANDLE;
  const normalizedHandle = normalizeHandle(effectiveHandle);
  // Fan Graph (#22): Follow lives in the frame capsule (decision 2)
  const followEnabled =
    process.env.NEXT_PUBLIC_FAN_GRAPH === "true" && normalizedHandle !== DEFAULT_HANDLE;
  const followState = useFollow(normalizedHandle, !!authUser, authPending || !followEnabled);
  const showRns = process.env.NEXT_PUBLIC_SHOW_RNS === "true";

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(profile?.revoName ?? "")
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  // Pause motion (041 I02): read the remembered choice once on the client
  useEffect(() => {
    setPaused(readPaused());
  }, []);
  const togglePaused = () => {
    setPaused(current => {
      writePaused(!current);
      return !current;
    });
  };

  // 039 I05: the background video pauses while the tab is hidden
  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // 039 I16: the capsule and the column clear the consent card while it shows
  const measureCard = useCallback((node: HTMLDivElement | null) => {
    cardObserver.current?.disconnect();
    if (!node) {
      setCardHeight(0);
      return;
    }
    const observer = new ResizeObserver(() => setCardHeight(node.offsetHeight));
    observer.observe(node);
    cardObserver.current = observer;
  }, []);

  // Owners browsing their own page are not counted
  const isOwnerView = !!authUser && !!profile && authUser.id === profile.id;
  const trackableProfileId = profile && profile.id > 0 && !isOwnerView ? profile.id : null;

  const pixelsEnabled = trackableProfileId !== null && hasAnyPixel(trackingPixels);

  useEffect(() => {
    if (authPending || trackableProfileId === null) return;
    const analytics = getAnalyticsConsent();
    const ads = pixelsEnabled ? getAdsConsent(trackableProfileId) : null;
    setConsent({ analytics, ads });
    // Ask when a choice is missing: return visits site-wide, ads per creator
    if (analytics === null || (pixelsEnabled && ads === null)) setBannerMode("prompt");

    // Pixels load only after this visitor allowed this creator's tags
    if (trackingPixels && pixelsEnabled && ads === true) {
      loadPixels(trackingPixels);
      trackProfileView(trackableProfileId, firePixelPageView(trackingPixels));
    } else {
      trackProfileView(trackableProfileId);
    }
    return startEngagementTracking(trackableProfileId);
    // trackingPixels is fixed for a given profile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authPending, trackableProfileId]);

  const handleConsent = (choice: ConsentChoice) => {
    if (trackableProfileId === null) return;
    const advertising = pixelsEnabled && choice.advertising && !hasGlobalPrivacyControl();
    saveConsent({
      analytics: choice.analytics,
      creatorId: trackableProfileId,
      ads: pixelsEnabled ? advertising : undefined,
    });
    recordConsent(
      trackableProfileId,
      { analytics: choice.analytics, advertising },
      bannerMode === "settings" ? "settings" : "banner"
    );
    const adsNewlyGranted = advertising && consent?.ads !== true;
    setConsent({ analytics: choice.analytics, ads: pixelsEnabled ? advertising : null });
    setBannerMode("hidden");
    if (adsNewlyGranted && trackingPixels) {
      loadPixels(trackingPixels);
      trackConsentedPageView(trackableProfileId, firePixelPageView(trackingPixels));
    }
  };

  const handleLinkClick = (block: BlockType) => {
    if (block.type !== "link" || trackableProfileId === null) return;
    const ad =
      pixelsEnabled && consent?.ads === true && trackingPixels
        ? firePixelLinkClick(trackingPixels, {
            label: block.config.label,
            url: block.config.url,
          })
        : undefined;
    trackLinkClick(trackableProfileId, block.id, ad);
  };

  useEffect(() => {
    if (initialData) return;
    setLoading(true);
    (async () => {
      try {
        const onlinkData = await trpcClient.handle.getHandle.query({
          handle: normalizedHandle,
        });
        if (onlinkData) {
          const data = mapGetHandleData(onlinkData, normalizedHandle);
          setProfile(data.profile);
          setTheme(data.theme);
          setBlocks(data.blocks);
          setHasCreatorPool(data.hasCreatorPool);
          setCreatorPoolAddress(data.creatorPoolAddress);
          setTrackingPixels(data.trackingPixels);
        }
      } catch {
        if (normalizedHandle === DEFAULT_HANDLE) {
          setProfile(DEFAULT_PROFILE_DATA.profile);
          setTheme(DEFAULT_PROFILE_DATA.theme);
          setBlocks(DEFAULT_PROFILE_DATA.blocks);
          setHasCreatorPool(DEFAULT_PROFILE_DATA.hasCreatorPool);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [normalizedHandle, initialData]);

  if (loading) return <ProfileSkeleton />;
  if (!profile) return <ProfileSkeleton />;

  const themeConfig = theme?.config;
  const fontColor = themeConfig?.fontColor || THEME_DEFAULTS.fontColor;
  const textStyle = { fontFamily: themeConfig?.fontFamily, color: fontColor };
  const revoNameUrl =
    profile.revoName && showRns
      ? `${process.env.NEXT_PUBLIC_RNS_URL}/#/profile/${profile.revoName.split(".")[0]}`
      : null;
  const particlesEffect = themeConfig?.particlesEffect ?? THEME_DEFAULTS.particlesEffect;
  const heroEffect = themeConfig?.heroEffect ?? 0;
  // 041 I02: any looping motion gets the Pause motion control
  const hasLoopingMotion =
    (particlesEffect !== 0 && particlesEffect !== 6) || LOOPING_HERO_EFFECTS.includes(heroEffect);
  const containerOn = (themeConfig?.containerStyle ?? 0) !== 0;
  const background = themeConfig?.background;
  const isGradient = background?.type === "color" && !!background.value?.includes("gradient");
  const renderable = blocks.filter(block => isRenderable(block));
  const hasPoolBlock = renderable.some(block => block.type === "pool");

  // 039 I03: one neutral frame capsule; nothing renders when it would be empty
  const isOwner = isOwnerView || (!!authUser && authUser.handle === normalizedHandle);
  const showViewPool = hasCreatorPool && !!creatorPoolAddress && !hasPoolBlock;
  const showFollow = followEnabled && !isOwner && !!followState.status;
  const showCapsule = showViewPool || isOwner || showFollow;
  const showPrivacyChoices = trackableProfileId !== null && consent !== null;
  const cardShowing = bannerMode !== "hidden" && trackableProfileId !== null;

  const photo = profile.photoCmp || profile.photoUrl;

  return (
    <div
      className="relative min-h-dvh"
      style={{ ...themeCssVars(themeConfig), "--amped-font": fontColor } as React.CSSProperties}
    >
      {/* 039 I05: background layer fixed to the viewport; the document scrolls */}
      <div
        aria-hidden
        className="fixed inset-0 z-0"
        style={{
          backgroundColor:
            background?.type === "color" && !isGradient ? background.value || undefined : undefined,
          background: isGradient ? background?.value || undefined : undefined,
        }}
      >
        {background?.type === "video" ? (
          <video
            ref={videoRef}
            src={background.value || ""}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : background?.type === "image" ? (
          <div
            className="h-full w-full bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${background.value})` }}
          />
        ) : null}
        <ParticlesBackground effect={particlesEffect} paused={paused} />
      </div>

      {/* 039 I06: one 610 column on the Fibonacci rhythm */}
      <div
        className="relative z-[1] mx-auto w-full max-w-[610px] px-[21px] pt-[34px] sm:px-0 sm:pt-[55px]"
        style={{
          paddingBottom: `calc(89px + env(safe-area-inset-bottom, 0px) + ${cardShowing ? cardHeight + 13 : 0}px)`,
        }}
      >
        <div
          className={cn(
            "w-full",
            containerOn && "p-[21px] sm:p-[34px]",
            getContainerStyle(themeConfig?.containerStyle)
          )}
          style={
            containerOn
              ? {
                  backgroundColor: `${themeConfig?.containerColor}${Math.round(
                    (themeConfig?.transparency ?? THEME_DEFAULTS.transparency) * 2.55
                  )
                    .toString(16)
                    .padStart(2, "0")}`,
                }
              : undefined
          }
        >
          <header className="flex flex-col items-center text-center">
            {/* 039 I08: one photo, compressed source first */}
            {photo && (
              <img
                src={photo}
                alt={profile.name}
                loading="eager"
                fetchPriority="high"
                className="h-[89px] w-[89px] rounded-full object-cover sm:h-[144px] sm:w-[144px]"
                style={containerOn ? undefined : { boxShadow: "5px 13px 34px rgba(48,47,93,0.14)" }}
              />
            )}
            {/* 039 I07, 041 I05: name 26/33 700; only the name carries the effect */}
            <h1
              title={profile.name}
              className={cn(
                "line-clamp-3 break-words text-[26px] font-bold leading-[33px] tracking-normal",
                photo && "mt-[21px]",
                getHeroEffectStyle(heroEffect, paused)
              )}
              style={textStyle}
            >
              {profile.name}
            </h1>
            {/* 039 I09: RevoName row, never animated */}
            {profile.revoName && showRns && (
              <div className="mt-2 flex items-center justify-center gap-1" style={textStyle}>
                {revoNameUrl ? (
                  <a
                    href={revoNameUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex min-h-[44px] min-w-0 items-center gap-1 text-[16px] font-semibold leading-[20px] underline-offset-2 hover:underline",
                      CREATOR_FOCUS
                    )}
                  >
                    <span className="break-all">{profile.revoName}</span>
                    <ExternalLink aria-hidden className="h-[21px] w-[21px] shrink-0" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="break-all text-[16px] font-semibold leading-[20px]">
                    {profile.revoName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy RevoName"
                  className={cn(
                    "flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full",
                    CREATOR_FOCUS
                  )}
                >
                  {copied ? (
                    <Check aria-hidden className="h-[21px] w-[21px]" />
                  ) : (
                    <Copy aria-hidden className="h-[21px] w-[21px]" />
                  )}
                </button>
                <span role="status" className="sr-only">
                  {copied ? "Copied" : ""}
                </span>
              </div>
            )}
            {/* 039 I07: bio 16/26 at the creator's full text color */}
            {profile.bio &&
              (isHTML(profile.bio) ? (
                <div
                  className="mt-[13px] w-full text-[16px] leading-[26px] [&_a]:underline"
                  style={textStyle}
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(profile.bio) }}
                />
              ) : (
                <p className="mt-[13px] w-full text-[16px] leading-[26px]" style={textStyle}>
                  {profile.bio}
                </p>
              ))}
          </header>

          {/* 040 I12: blocks 13 apart; blocks add no margins of their own */}
          {renderable.length > 0 && (
            <div className="mt-[34px] flex flex-col gap-[13px]">
              {renderable.map(block => (
                <ErrorBoundary
                  key={block.id}
                  fallback={null}
                  context={{ blockId: block.id, type: block.type }}
                >
                  {block.type === "link" ? (
                    <CreatorButton
                      theme={themeConfig}
                      icon={<LinkIcon platform={block.config.platform} url={block.config.url} />}
                      label={block.config.label}
                      href={block.config.url}
                      onClick={() => handleLinkClick(block)}
                    />
                  ) : block.type === "media" ? (
                    <MediaBlock block={block as any} theme={themeConfig as any} />
                  ) : block.type === "pool" ? (
                    <CreatorPoolBlock block={block as any} theme={themeConfig as any} />
                  ) : block.type === "referral" ? (
                    <ReferralBlock
                      block={block as any}
                      theme={themeConfig as any}
                      pageOwnerId={profile.id}
                    />
                  ) : (
                    <TextBlock block={block as any} theme={themeConfig as any} />
                  )}
                </ErrorBoundary>
              ))}
            </div>
          )}

          {/* 039 I10, I15; 041 I02, I08: footer mark, Pause motion, privacy links */}
          <footer className="mt-[34px] flex flex-col items-center" style={textStyle}>
            <div className="flex items-center gap-[13px]">
              <button
                type="button"
                onClick={() => {
                  if (profile.id) handleReferrerClick(profile.id);
                }}
                className={cn(
                  "min-h-[44px] px-1 text-[13px] leading-[16px] underline-offset-2 hover:underline",
                  CREATOR_FOCUS
                )}
              >
                Made with Amped.Bio
              </button>
              {hasLoopingMotion && (
                <button
                  type="button"
                  onClick={togglePaused}
                  aria-pressed={paused}
                  aria-label={paused ? "Play motion" : "Pause motion"}
                  className={cn(
                    "flex h-[44px] w-[44px] items-center justify-center rounded-full",
                    CREATOR_FOCUS
                  )}
                >
                  {paused ? (
                    <Play aria-hidden className="h-[21px] w-[21px]" />
                  ) : (
                    <Pause aria-hidden className="h-[21px] w-[21px]" />
                  )}
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-[13px]">
              {showPrivacyChoices && (
                <button
                  type="button"
                  onClick={() => setBannerMode("settings")}
                  className={cn(
                    "min-h-[44px] px-1 text-[13px] leading-[16px] underline-offset-2 hover:underline",
                    CREATOR_FOCUS
                  )}
                >
                  Privacy choices
                </button>
              )}
              <a
                href="/privacy"
                className={cn(
                  "inline-flex min-h-[44px] items-center px-1 text-[13px] leading-[16px] underline-offset-2 hover:underline",
                  CREATOR_FOCUS
                )}
              >
                Privacy Policy
              </a>
            </div>
          </footer>
        </div>
      </div>

      {/* Frame layer: Amped chrome only (section 17). The capsule sits 13 above
          the consent card while it shows, else 21 from the bottom (039 I16). */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-[13px] px-[13px]"
        style={{ paddingBottom: "calc(21px + env(safe-area-inset-bottom, 0px))" }}
      >
        <FollowToastView toast={followState.toast} onDismiss={followState.dismissToast} />
        {showCapsule && (
          <nav
            aria-label="Page actions"
            className={cn(
              "prism-glass-clear prism-font pointer-events-auto flex items-center gap-[5px] !rounded-full p-[5px]",
              // 390 (fg2, fg9): the count sits above the buttons
              showFollow &&
                "w-full max-w-[508px] flex-col !rounded-prism-34 p-2 sm:w-auto sm:flex-row sm:!rounded-full sm:p-[5px] sm:pl-[13px]",
              "transition-[transform,opacity] duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
              scrollingDown && !cardShowing && "pointer-events-none translate-y-[89px] opacity-0"
            )}
          >
            {showFollow && <FollowerCount status={followState.status} />}
            <div
              className={cn("flex items-center gap-[5px]", showFollow && "w-full gap-2 sm:w-auto")}
            >
              {showFollow && (
                <FollowButton
                  status={followState.status}
                  busy={followState.busy}
                  onFollow={followState.startFollow}
                  onUnfollow={() => void followState.unfollow()}
                  onUpdate={patch => void followState.update(patch)}
                />
              )}
              {showViewPool && (
                <Button
                  asChild
                  variant="secondary"
                  className={showFollow ? "flex-1 sm:flex-none" : undefined}
                >
                  <a href={`/i/pools/${creatorPoolAddress}`}>View pool</a>
                </Button>
              )}
              {isOwner && (
                <Button asChild variant="secondary">
                  <a href={`${process.env.NEXT_PUBLIC_PANEL_URL || ""}/page`}>
                    <Pencil aria-hidden />
                    Edit page
                  </a>
                </Button>
              )}
            </div>
          </nav>
        )}
        {showFollow && (
          <FirstFollowSheet
            open={followState.sheetOpen}
            onOpenChange={followState.setSheetOpen}
            creatorName={followState.status?.creatorName ?? profile.name}
            busy={followState.busy}
            onConfirm={choice => void followState.follow({ ...choice, fromDisclosure: true })}
          />
        )}
        {cardShowing && (
          <div ref={measureCard} className="pointer-events-auto w-full">
            <TrackingConsentBanner
              key={bannerMode}
              ownerName={profile.name || "This creator"}
              adServices={pixelsEnabled && trackingPixels ? pixelServiceNames(trackingPixels) : []}
              adsBlockedByBrowser={hasGlobalPrivacyControl()}
              initial={{
                analytics: consent?.analytics === true,
                advertising: consent?.ads === true,
              }}
              startExpanded={bannerMode === "settings"}
              onSave={handleConsent}
            />
          </div>
        )}
      </div>
    </div>
  );
}

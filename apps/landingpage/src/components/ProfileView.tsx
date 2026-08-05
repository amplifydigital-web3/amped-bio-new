"use client";

import { useEffect, useState } from "react";
import { Link } from "lucide-react";
import { trpcClient } from "@/lib/trpc";
import { normalizeHandle } from "@/lib/handle";
import { Skeleton } from "@repo/ui";
import { cn } from "@repo/ui";
import { ParticlesBackground } from "@/components/ParticlesBackground";
import {
  getButtonBaseStyle,
  getButtonEffectStyle,
  getContainerStyle,
  getHeroEffectStyle,
  isHTML,
} from "@/lib/styles";
import type { BlockType, ThemeConfig } from "@repo/constants";

interface UserProfile {
  id: number;
  name: string;
  handle: string;
  handleFormatted: string;
  email: string;
  bio: string;
  photoUrl?: string;
  revoName?: string;
}

interface Theme {
  id: number;
  name: string;
  config: ThemeConfig;
}

const DEFAULT_HANDLE = "landingpage";

function ProfileSkeleton() {
  return (
    <div className="flex flex-col h-screen">
      <div className="fixed inset-0 w-full h-full z-[1] bg-gray-100">
        <div className="absolute inset-0" />
      </div>
      <div className="min-h-full relative z-[2]">
        <div className="relative min-h-full py-8 px-4 transition-all duration-300 mx-auto z-10 max-w-[640px]">
          <div className="w-full space-y-8 p-8 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative">
                <Skeleton className="w-32 h-32 rounded-full object-cover ring-4 ring-white/50 shadow-xl" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-8 w-48 mx-auto rounded" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-64 mx-auto rounded" />
                  <Skeleton className="h-4 w-56 mx-auto rounded" />
                  <Skeleton className="h-4 w-60 mx-auto rounded" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="w-full px-4 py-3 flex items-center space-x-3 rounded-lg">
                  <Skeleton className="w-5 h-5 flex-shrink-0 rounded-full" />
                  <Skeleton className="flex-1 h-5 rounded" />
                </div>
              ))}
            </div>
            <div className="pt-4 text-center">
              <Skeleton className="h-4 w-40 mx-auto rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PLATFORM_ICONS: Record<string, () => JSX.Element> = {
  twitter: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  github: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  telegram: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.938z" />
    </svg>
  ),
  instagram: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
  youtube: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  tiktok: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  ),
  spotify: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  ),
  discord: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
  ),
  facebook: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
};

function getPlatformIcon(platformId: string) {
  const Icon = PLATFORM_ICONS[platformId];
  if (Icon) return <Icon />;
  return <Link className="w-5 h-5 flex-shrink-0" />;
}

function extractRootDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function ProfileView({ handle: rawHandle }: { handle?: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [blocks, setBlocks] = useState<BlockType[]>([]);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [loading, setLoading] = useState(true);

  const effectiveHandle = rawHandle || DEFAULT_HANDLE;
  const normalizedHandle = normalizeHandle(effectiveHandle);

  useEffect(() => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trpcClient.handle.getHandle.query as any)({ handle: normalizedHandle })
      .then((onlinkData: any) => {
        if (onlinkData) {
          const { user, theme: themeData, blocks: blocksRaw } = onlinkData;
          setProfile({
            id: user.id,
            name: user.name,
            handle: normalizedHandle,
            handleFormatted: `@${normalizedHandle}`,
            email: user.email,
            bio: user.description ?? "",
            photoUrl: user.image ?? "",
            revoName: user.revoName ?? "",
          });
          setTheme(themeData);
          setBlocks([...blocksRaw].sort((a, b) => a.order - b.order));
        }
      })
      .catch(() => {
        if (normalizedHandle === DEFAULT_HANDLE) {
          setProfile({
            id: 0,
            name: "Amplify Digital",
            handle: "amped.bio",
            handleFormatted: "@amped.bio",
            email: "info@amplifydigital.ai",
            bio: "Empowering individuals and communities, enabling seamless transactions without intermediaries",
          });
          setBlocks([
            { id: 1, order: 0, type: "link", config: { platform: "twitter", url: "https://x.com/amped_bio", label: "Follow on X" } },
            { id: 2, order: 1, type: "link", config: { platform: "github", url: "https://github.com/amplifydigital-web3", label: "Check out our Github" } },
            { id: 3, order: 2, type: "link", config: { platform: "telegram", url: "https://t.me/npayme_network", label: "Connect on Telegram" } },
          ]);
        }
      })
      .finally(() => setLoading(false));
  }, [normalizedHandle]);

  if (loading) return <ProfileSkeleton />;
  if (!profile) return <ProfileSkeleton />;

  const themeConfig = theme?.config;

  return (
    <div className="flex flex-col h-screen">
      <div
        className={cn(
          "flex-1 overflow-auto relative",
          themeConfig?.background?.type === "color" &&
            !themeConfig?.background?.value?.includes("gradient")
            ? "bg-gray-100"
            : ""
        )}
      >
        {/* Background Layer - Fixed to viewport */}
        <div
          className="fixed inset-0 w-full h-full z-[1]"
          style={{
            backgroundColor:
              themeConfig?.background?.type === "color" &&
              !themeConfig?.background?.value?.includes("gradient")
                ? themeConfig?.background?.value || undefined
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
            <ParticlesBackground effect={themeConfig?.particlesEffect ?? 0} />
          </div>
        </div>

        {/* Content Layer */}
        <div className="min-h-full relative z-[2]">
          <div className="relative min-h-full py-8 px-4 transition-all duration-300 mx-auto z-10 max-w-[640px]">
            {/* Container */}
            <div
              className={cn("w-full space-y-8 p-8", getContainerStyle(themeConfig?.containerStyle))}
              style={{
                backgroundColor: `${themeConfig?.containerColor || "#ffffff"}${Math.round(
                  ((themeConfig?.transparency ?? 0) * 2.55)
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
                    </h1>
                  </div>
                  {profile.bio && (
                    isHTML(profile.bio) ? (
                      <p
                        className="text-lg max-w-2xl mx-auto leading-relaxed"
                        style={{
                          fontFamily: themeConfig?.fontFamily,
                          color: themeConfig?.fontColor,
                          opacity: 0.9,
                        }}
                        dangerouslySetInnerHTML={{ __html: profile.bio }}
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
                    )
                  )}
                </div>
              </div>

              {/* Links & Blocks */}
              <div className="space-y-4">
                {blocks.map(block => {
                  if (block.type === "link") {
                    const element =
                      block.config.platform === "custom" ? (
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${extractRootDomain(block.config.url)}&sz=128`}
                          className="w-5 h-5 flex-shrink-0 rounded-full"
                          alt=""
                        />
                      ) : (
                        getPlatformIcon(block.config.platform)
                      );

                    return (
                      <a
                        key={block.id}
                        href={block.config.url}
                        target="_blank"
                        rel="noopener noreferrer"
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
                    );
                  }

                  if (block.type === "text") {
                    const textConfig = block.config as unknown as { content?: string };
                    return (
                      <div
                        key={block.id}
                        className="px-4 py-2 text-gray-700 whitespace-pre-wrap"
                        style={{
                          fontFamily: themeConfig?.fontFamily,
                          color: themeConfig?.fontColor,
                        }}
                      >
                        {textConfig.content || ""}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>

              {/* Powered by footer */}
              <div className="pt-4 text-center">
                <a
                  href={process.env.NEXT_PUBLIC_PANEL_URL || "/register"}
                  className="text-sm opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
                  style={{
                    fontFamily: themeConfig?.fontFamily,
                    color: themeConfig?.fontColor,
                    border: "none",
                    outline: "none",
                    background: "none",
                    padding: 0,
                    display: "inline",
                  }}
                >
                  Claim your own Amped.Bio
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

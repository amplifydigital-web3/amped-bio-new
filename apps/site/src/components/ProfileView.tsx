"use client";

import { useEffect, useState } from "react";
import { trpcClient } from "@/lib/trpc";
import { normalizeHandle } from "@/lib/handle";
import { Skeleton } from "@ampedbio/ui";
import { Card, CardContent } from "@ampedbio/ui";
import type { BlockType, ThemeConfig } from "@ampedbio/constants";

interface UserProfile {
  id: number;
  name: string;
  handle: string;
  handleFormatted: string;
  email: string;
  bio: string;
  photoUrl?: string;
}

interface Theme {
  id: number;
  name: string;
  config: ThemeConfig;
}

const DEFAULT_HANDLE = "landingpage";

function ProfileSkeleton() {
  return (
    <div className="flex flex-col min-h-screen">
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
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="w-full px-4 py-3 flex items-center space-x-3 rounded-lg"
                >
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

function renderBlock(block: BlockType) {
  const { type, config } = block;

  if (type === "link") {
    const linkConfig = config as { platform?: string; url?: string; label?: string };
    const url = linkConfig.url || "#";
    const label = linkConfig.label || linkConfig.platform || "Link";

    return (
      <a
        key={block.id}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-center font-medium"
      >
        {label}
      </a>
    );
  }

  if (type === "text") {
    const textConfig = config as { content?: string };
    return (
      <div key={block.id} className="px-4 py-2 text-gray-700 whitespace-pre-wrap">
        {textConfig.content || ""}
      </div>
    );
  }

  return null;
}

export function ProfileView({ handle: rawHandle }: { handle?: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [blocks, setBlocks] = useState<BlockType[]>([]);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const effectiveHandle = rawHandle || DEFAULT_HANDLE;
  const normalizedHandle = normalizeHandle(effectiveHandle);

  useEffect(() => {
    setLoading(true);
    setError(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trpcClient.handle.getHandle.query as any)({ handle: normalizedHandle })
      .then((onlinkData: any) => {
        if (onlinkData) {
          const { user, theme: themeData, blocks: blocksRaw } = onlinkData;
          const { id, name, email, description, image } = user;

          setProfile({
            id,
            name,
            handle: normalizedHandle,
            handleFormatted: `@${normalizedHandle}`,
            email,
            bio: description ?? "",
            photoUrl: image ?? "",
          });

          setTheme(themeData as unknown as Theme);
          const sortedBlocks = (blocksRaw as BlockType[]).sort((a, b) => a.order - b.order);
          setBlocks(sortedBlocks);
        } else {
          setError(true);
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
            {
              id: 1,
              order: 0,
              type: "link",
              config: { platform: "twitter", url: "https://x.com/amped_bio", label: "Follow on X" },
            },
            {
              id: 2,
              order: 1,
              type: "link",
              config: { platform: "github", url: "https://github.com/amplifydigital-web3", label: "Check out our Github" },
            },
            {
              id: 3,
              order: 2,
              type: "link",
              config: { platform: "telegram", url: "https://t.me/npayme_network", label: "Connect on Telegram" },
            },
          ]);
          setTheme(null);
        } else {
          setError(true);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [normalizedHandle]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md mx-auto p-8 text-center">
          <CardContent className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">Profile Not Found</h2>
            <p className="text-gray-600">
              The profile you are looking for does not exist or has been removed.
            </p>
            <a
              href="/"
              className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Go to Home
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return <ProfileSkeleton />;
  }

  const themeConfig = theme?.config;
  const bgStyle = themeConfig?.background
    ? {
        backgroundImage: `url(${themeConfig.background.value})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed inset-0 w-full h-full z-[1] bg-gray-100" style={bgStyle}>
        <div className="absolute inset-0 bg-black/10" />
      </div>
      <div className="min-h-full relative z-[2]">
        <div className="relative min-h-full py-8 px-4 transition-all duration-300 mx-auto z-10 max-w-[640px]">
          <div
            className="w-full space-y-8 p-8 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg"
            style={{
              backgroundColor: themeConfig?.containerColor
                ? `${themeConfig.containerColor}cc`
                : undefined,
            }}
          >
            {/* Profile Section */}
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt={profile.name}
                    className="w-32 h-32 rounded-full object-cover ring-4 ring-white/50 shadow-xl"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-primary flex items-center justify-center text-white text-4xl font-bold ring-4 ring-white/50 shadow-xl">
                    {profile.name?.charAt(0) || "?"}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h1
                  className="text-2xl font-bold"
                  style={{ color: themeConfig?.fontColor || undefined }}
                >
                  {profile.name}
                </h1>
                <p
                  className="text-lg text-gray-500"
                  style={{ color: themeConfig?.fontColor ? `${themeConfig.fontColor}99` : undefined }}
                >
                  {profile.handleFormatted}
                </p>
                {profile.bio && (
                  <p
                    className="text-gray-600 max-w-sm leading-relaxed"
                    style={{ color: themeConfig?.fontColor || undefined }}
                  >
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Links & Blocks */}
            {blocks.length > 0 && (
              <div className="space-y-3">
                {blocks.map((block) => renderBlock(block))}
              </div>
            )}

            {/* Powered by */}
            <div className="pt-4 text-center">
              <p className="text-xs text-gray-400">Powered by Amped Bio</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

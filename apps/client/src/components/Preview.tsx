import React from "react";
import { Link } from "react-router-dom";
import { useEditor } from "../contexts/EditorContext";
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
import { isHTML } from "@/utils/htmlutils";

// Helper function to extract the root domain from a URL
const extractRootDomain = (url: string): string => {
  try {
    // Add protocol if missing to make URL constructor work
    const urlString = url.startsWith("http") ? url : `https://${url}`;
    const urlObj = new URL(urlString);
    return urlObj.hostname;
  } catch (e) {
    // Return the original URL if parsing fails
    return url;
  }
};

interface PreviewProps {
  isEditing: boolean;
  onelink: string;
}

export function Preview(_props: PreviewProps) {
  const [isMobile, setIsMobile] = React.useState(false);
  const { profile, blocks, theme } = useEditor();
  const themeConfig = theme.config;

  // console.info("blocks preview", blocks);

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
          <div
            className={cn(
              "relative min-h-full py-8 px-4 transition-all duration-300 mx-auto z-10",
              isMobile ? "max-w-[375px]" : "max-w-[640px]"
            )}
          >
            {/* Container */}
            <div
              className={cn("w-full space-y-8 p-8", getContainerStyle(themeConfig?.containerStyle))}
              style={{
                backgroundColor: `${themeConfig?.containerColor}${Math.round(
                  (themeConfig?.transparency ?? 0) * 2.55
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
                <div className="space-y-4">
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
                  {profile.bio &&
                    (isHTML(profile.bio) ? (
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
                    ))}
                </div>
              </div>

              {/* Links & Blocks */}
              <div className="space-y-4">
                {blocks.map(block => {
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
                      <a
                        key={block.id.toString()}
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
                  if (block.type === "media") {
                    return <MediaBlock key={block.id} block={block} theme={themeConfig} />;
                  }
                  return <TextBlock key={block.id} block={block} theme={themeConfig} />;
                })}
              </div>

              {/* Powered by footer */}
              <div className="pt-4 text-center">
                <Link
                  to="/register"
                  className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                  style={{
                    fontFamily: themeConfig?.fontFamily,
                    color: themeConfig?.fontColor,
                  }}
                >
                  Claim your own Amped.Bio
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

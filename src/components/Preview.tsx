import React from "react";
import { useEditorStore } from "../store/editorStore";
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
import { TextBlock } from "./blocks/TextBlock";

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

export function Preview(props: PreviewProps) {
  const [isMobile, setIsMobile] = React.useState(false);
  const profile = useEditorStore(state => state.profile);
  const blocks = useEditorStore(state => state.blocks);
  const theme = useEditorStore(state => state.theme.config);

  console.info("blocks preview", blocks);

  return (
    <div className="flex flex-col h-screen">
      <div
        className={cn(
          "flex-1 overflow-auto relative",
          theme.background.type === "color" && !theme.background.value.includes("gradient")
            ? "bg-gray-100"
            : ""
        )}
      >
        {/* Background Layer - Fixed to viewport */}
        <div
          className="fixed inset-0 w-full h-full z-[1]"
          style={{
            backgroundColor:
              theme.background.type === "color" && !theme.background.value.includes("gradient")
                ? theme.background.value
                : undefined,
            background:
              theme.background.type === "color" && theme.background.value.includes("gradient")
                ? theme.background.value
                : undefined,
          }}
        >
          {theme.background.type === "video" ? (
            <video
              src={theme.background.value}
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : theme.background.type === "image" ? (
            <div
              className="w-full h-full bg-no-repeat bg-center"
              style={{
                backgroundImage: `url(${theme.background.value})`,
                backgroundSize: "cover",
              }}
            />
          ) : null}
          <div className="absolute inset-0">
            <ParticlesBackground effect={theme.particlesEffect} />
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
              className={cn("w-full space-y-8 p-8", getContainerStyle(theme.containerStyle))}
              style={{
                backgroundColor: `${theme.containerColor}${Math.round(theme.transparency * 2.55)
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
                    <div className="absolute -inset-1 rounded-full blur-lg bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-30 group-hover:opacity-50 transition-opacity" />
                  </div>
                )}
                {profile.photoCmp && (
                  <div className="relative">
                    <img src={profile.photoCmp} alt={profile.name} className="w-32 h-auto" />
                    {/* <div className="absolute -inset-1 rounded-full blur-lg bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-30 group-hover:opacity-50 transition-opacity" /> */}
                  </div>
                )}
                <div className="space-y-4">
                  <h1
                    className={cn(
                      "text-4xl font-bold tracking-tight",
                      getHeroEffectStyle(theme.heroEffect)
                    )}
                    style={{
                      fontFamily: theme.fontFamily,
                      color: theme.fontColor,
                    }}
                  >
                    {profile.name}
                  </h1>
                  {/* {profile.title && (
                    <p
                      className="text-xl font-medium"
                      style={{
                        fontFamily: theme.fontFamily,
                        color: theme.fontColor
                      }}
                    >
                      {profile.title}
                    </p>
                  )} */}
                  {profile.bio && (
                    <p
                      className="text-lg max-w-2xl mx-auto leading-relaxed"
                      style={{
                        fontFamily: theme.fontFamily,
                        color: theme.fontColor,
                        opacity: 0.9,
                      }}
                    >
                      {profile.bio}
                    </p>
                  )}
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
                          getButtonBaseStyle(theme.buttonStyle),
                          getButtonEffectStyle(theme.buttonEffect)
                        )}
                        style={{
                          backgroundColor: theme.buttonColor,
                          fontFamily: theme.fontFamily,
                          fontSize: theme.fontSize,
                          color: theme.fontColor,
                        }}
                      >
                        {element}
                        <span className="flex-1 text-center">{block.config.label}</span>
                      </a>
                    );
                  }
                  if (block.type === "media") {
                    return <MediaBlock key={block.id} block={block} theme={theme} />;
                  }
                  return <TextBlock key={block.id} block={block} theme={theme} />;
                })}
              </div>

              {/* Powered by footer */}
              <div className="pt-4 text-center">
                <p
                  className="text-sm opacity-70"
                  style={{
                    fontFamily: theme.fontFamily,
                    color: theme.fontColor,
                  }}
                >
                  Powered by Amped.Bio
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

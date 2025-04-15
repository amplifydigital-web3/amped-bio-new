import { Music } from "lucide-react";
import type { ThemeConfig } from "../../types/editor";
import { MediaBlock } from "@/api/api.types";

interface SpotifyBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

function getSpotifyEmbedUrl(url: string): string {
  try {
    // Convert Spotify URL to embed URL
    const spotifyUrl = new URL(url);
    const path = spotifyUrl.pathname;

    if (path.includes("track")) {
      // For tracks
      return `https://open.spotify.com/embed${path}`;
    } else if (path.includes("playlist")) {
      // For playlists
      return `https://open.spotify.com/embed${path}?utm_source=generator`;
    } else {
      return url;
    }
  } catch {
    return url;
  }
}

export function SpotifyBlock({ block, theme }: SpotifyBlockProps) {
  // Use either content or url, prioritizing content
  const spotifyUrl = block.config.content || block.config.url || "";
  const embedUrl = getSpotifyEmbedUrl(spotifyUrl);

  const isTrack = spotifyUrl.includes("track");
  const isPlaylist = spotifyUrl.includes("playlist");

  if (!spotifyUrl) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#1DB954]/10 border-2 border-dashed border-[#1DB954]/20 flex flex-col items-center justify-center space-y-2">
        <Music className="w-8 h-8 text-[#1DB954]" />
        <p className="text-sm text-[#1DB954]" style={{ fontFamily: theme.fontFamily }}>
          Add a Spotify track or playlist URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <Music className="w-4 h-4 text-[#1DB954]" />
        <span
          className="text-sm font-medium text-[#1DB954]"
          style={{ fontFamily: theme.fontFamily }}
        >
          {isTrack ? "Spotify Track" : isPlaylist ? "Spotify Playlist" : "Spotify"}
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-[#121212] shadow-lg">
        <iframe
          src={embedUrl}
          width="100%"
          height={isPlaylist ? "380" : "152"}
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="w-full"
        />
      </div>
    </div>
  );
}

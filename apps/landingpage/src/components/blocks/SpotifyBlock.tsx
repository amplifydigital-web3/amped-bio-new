import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { EmbedFrame, embedTitle } from "./frame";

// Screen Review 040 I02, I07: no platform label row; 152 for a track or
// episode, 352 for a playlist, album or show.
const TALL = ["playlist", "album", "show", "artist"];

function spotifyEmbed(url: string): { src: string; tall: boolean } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("spotify.com")) return null;
    const path = parsed.pathname.replace(/^\/embed/, "").replace(/^\/intl-[a-z]+/, "");
    const kind = path.split("/")[1] ?? "";
    if (!kind) return null;
    return { src: `https://open.spotify.com/embed${path}`, tall: TALL.includes(kind) };
  } catch {
    return null;
  }
}

export function SpotifyBlock({ block, theme }: { block: MediaBlock; theme: ThemeConfig }) {
  const embed = spotifyEmbed(block.config.content || block.config.url || "");
  // 040 I01: nothing renders for a link only the creator can fix
  if (!embed) return null;
  return (
    <EmbedFrame
      title={embedTitle("Spotify", block.config.label)}
      src={embed.src}
      height={embed.tall ? 352 : 152}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      theme={theme}
    />
  );
}

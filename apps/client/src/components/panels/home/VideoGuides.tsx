import { useId, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@repo/ui";
import { Eyebrow } from "./TestnetCard";
import { VIDEO_GUIDES } from "./homeContent";
import { VideoPlayerDialog } from "./VideoPlayerDialog";

// Screen Review 016, Video guides (Rob, 1 Oct). Nothing loads from YouTube
// until play: the cards draw their own poster, and the player is the shared
// VideoPlayerDialog (a youtube-nocookie.com embed in the shared Dialog).

type Guide = (typeof VIDEO_GUIDES)[number];

export function VideoGuides({ className }: { className?: string }) {
  const titleId = useId();
  const [playing, setPlaying] = useState<Guide | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  return (
    <section aria-labelledby={titleId} className={cn("space-y-[13px]", className)}>
      <Eyebrow id={titleId}>Video guides</Eyebrow>
      <ul className="grid grid-cols-2 gap-[13px]">
        {VIDEO_GUIDES.map(guide => (
          <li key={guide.id}>
            <button
              type="button"
              onClick={event => {
                opener.current = event.currentTarget;
                setPlaying(guide);
              }}
              aria-label={`Play ${guide.title}, video on YouTube`}
              className="prism-focus prism-glass-clear group flex w-full flex-col overflow-hidden text-left"
            >
              <span
                aria-hidden
                className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-prism-value/10 to-prism-nav/25"
              >
                <span className="prism-disc flex items-center justify-center transition-transform duration-prism-hover group-hover:scale-105 motion-reduce:transition-none">
                  <Play className="ml-0.5 h-[21px] w-[21px] fill-prism-ink text-prism-ink" />
                </span>
              </span>
              <span className="block space-y-1 p-[13px]">
                <span className="block text-prism-label font-semibold text-prism-ink">
                  {guide.title}
                </span>
                <span className="block text-prism-meta text-prism-ink-2">Video · YouTube</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <VideoPlayerDialog video={playing} onClose={() => setPlaying(null)} returnFocus={opener} />
    </section>
  );
}

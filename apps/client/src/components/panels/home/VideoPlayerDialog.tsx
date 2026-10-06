import type { RefObject } from "react";
import { ExternalLink } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";

export interface PlayerVideo {
  id: string;
  title: string;
}

/**
 * The one shared video player (Screen Review 016, Rob 1 Oct): a
 * youtube-nocookie.com embed in the shared Dialog. Nothing loads from YouTube
 * until a video is passed in. Video guides on Home and Watch how on the
 * Testnet faucet card (053) open it.
 */
export function VideoPlayerDialog({
  video,
  onClose,
  returnFocus,
}: {
  video: PlayerVideo | null;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={!!video} onOpenChange={open => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[508px]"
        // Keep focus on the dialog, not inside the player: a focused cross
        // origin frame swallows Escape
        onOpenAutoFocus={event => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        // Escape or close returns focus to the control that opened the player
        onCloseAutoFocus={event => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{video?.title}</DialogTitle>
          <DialogDescription className="sr-only">Video from YouTube</DialogDescription>
        </DialogHeader>
        {video && (
          <div className="aspect-video w-full overflow-hidden rounded-prism-13 bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
              title={video.title}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
        {video && (
          <Button asChild variant="ghost" className="-ml-3 justify-self-start">
            <a
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch on YouTube
              <ExternalLink aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

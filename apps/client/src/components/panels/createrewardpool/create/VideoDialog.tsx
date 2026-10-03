import { useRef, useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";

/**
 * Watch how link (Rob, 1 Oct) with the shared player Dialog pattern from row
 * 016: nothing loads from YouTube until the person opens it, and the embed is
 * youtube-nocookie.com. Render it inside the panel so the dialogs nest.
 */
export function WatchHow({ video }: { video: { id: string; title: string } }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={opener}
        type="button"
        variant="ghost"
        className="shrink-0"
        aria-label={`Watch how: ${video.title}, video on YouTube`}
        onClick={() => setOpen(true)}
      >
        <PlayCircle aria-hidden />
        Watch how
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-[508px]"
          // Keep focus on the dialog, not the cross origin frame, so Escape works
          onOpenAutoFocus={event => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{video.title}</DialogTitle>
            <DialogDescription className="sr-only">Video from YouTube</DialogDescription>
          </DialogHeader>
          {open && (
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
        </DialogContent>
      </Dialog>
    </>
  );
}

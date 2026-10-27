import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button, ErrorCard } from "@repo/ui";
import { Eyebrow } from "./TestnetCard";
import { UPDATES_URL } from "./homeContent";

// Screen Review 016 D2 (alternative kept). The onboarding site as an Updates
// section, last in the left column and last in the tab order. A frame that
// has not loaded after 15 seconds shows the error card.

const LOAD_TIMEOUT_MS = 15_000;
const HOST = new URL(UPDATES_URL).host;

function OpenInNewTab() {
  return (
    <Button asChild variant="ghost">
      <a href={UPDATES_URL} target="_blank" rel="noopener noreferrer">
        Open in new tab
        <ExternalLink aria-hidden />
      </a>
    </Button>
  );
}

export function UpdatesFrame({ className }: { className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    const timer = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [attempt]);

  useEffect(() => {
    if (loaded) setFailed(false);
  }, [loaded]);

  return (
    <section aria-labelledby="home-updates-title" className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <Eyebrow id="home-updates-title">Updates</Eyebrow>
          <p className="text-prism-meta text-prism-ink-2">From {HOST}</p>
        </div>
        <OpenInNewTab />
      </div>
      {failed && !loaded ? (
        <ErrorCard
          title="Updates did not load"
          cause="Check your connection, or open the updates in a new tab."
          onRetry={() => setAttempt(value => value + 1)}
          retryLabel="Retry"
        />
      ) : (
        <div className="prism-glass-clear overflow-hidden">
          <iframe
            key={attempt}
            src={UPDATES_URL}
            title="Amped.Bio updates"
            onLoad={() => setLoaded(true)}
            className="block h-[610px] w-full bg-white"
            style={{ border: "none" }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      )}
    </section>
  );
}
